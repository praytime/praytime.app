/* globals require */
const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()
const db = admin.firestore()
db.settings({ timestampsInSnapshots: true })

function arrayDiff (prev, curr) {
  if (!Array.isArray(prev)) { prev = [] }
  if (!Array.isArray(curr)) { curr = [] }
  return {
    prev: prev,
    curr: curr,
    added: curr.filter(e => !prev.includes(e)),
    deleted: prev.filter(e => !curr.includes(e))
  }
}

// TODO
// const keys = obj => obj == null ? [] : Object.keys(obj)
function keys (obj) {
  if (obj == null) { return [] }

  return Object.keys(obj)
}

// user: {
//  topics string[]
// }

function updateTopics (ref, topics) {
  return ref.get()
    .then(function (snapshot) {
      if (snapshot.size === 0) {
        return true
      }

      const batch = db.batch()
      snapshot.forEach(function (doc) {
        batch.update(doc.ref, { desiredTopics: topics })
      })
      return batch.commit()
    })
}

exports.createUser = functions.firestore
  .document('Users/{userId}')
  .onCreate((snap, context) => {
    const userDoc = snap.data()

    if (keys(userDoc.topics) === 0) {
      // nothing to do
      return true
    }

    return updateTopics(snap.ref.collection('FCMTokens'), userDoc.topics)
  })

exports.updateUser = functions.firestore
  .document('Users/{userId}')
  .onUpdate((change, context) => {
    const topicDiff = arrayDiff(keys(change.before.data().topics), keys(change.after.data().topics))

    if (topicDiff.added.length === 0 && topicDiff.deleted.length === 0) {
      // nothing to do
      return true
    }

    return updateTopics(change.after.ref.collection('FCMTokens'), change.after.data().topics)
  })

exports.deleteUser = functions.firestore
  .document('Users/{userId}')
  .onDelete((snap, context) => {
    return snap.ref.collection('FCMTokens').get()
      .then(function (snapshot) {
        if (snapshot.size === 0) {
          return true
        }

        // Delete documents in a batch
        const batch = db.batch()
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref)
        })
        return batch.commit()
      })
  })

// token: {
//  defunct bool
//  desiredTopics string[]
//  currentTopics string[]
// }

// Define a common error handler for topic management api errors
function topicManagementErrorHandler (errors, tokenDoc) {
  for (const error of errors) {
    console.error(error)
    // Cleanup the tokens who are not registered anymore.
    if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
      tokenDoc.defunct = true
    }
  }
}

function topicManagment (tokenId, tokenDoc, added, deleted) {
  return Promise.all([
    Promise.all(added.map(topic =>
      admin.messaging()
        .subscribeToTopic(tokenId, topic)
        .then(response => {
          if (response.failureCount > 0) {
            topicManagementErrorHandler(response.errors)
          } else {
            tokenDoc.currentTopics[topic] = true
          }
        }))),
    Promise.all(deleted.map(topic =>
      admin.messaging()
        .unsubscribeFromTopic(tokenId, topic)
        .then(response => {
          if (response.failureCount > 0) {
            topicManagementErrorHandler(response.errors)
          } else {
            delete tokenDoc.currentTopics[topic]
          }
        })))
  ])
}

function handleWrite (tokenId, snap) {
  const tokenDoc = snap.data()
  console.log('handleWrite', tokenDoc)

  if (tokenDoc.defunct) {
    return snap.ref.delete()
      .catch(error => console.error('handleWrite[defunct] error:', error))
  }

  if (typeof tokenDoc.currentTopics === 'undefined' || tokenDoc.currentTopics == null) {
    tokenDoc.currentTopics = {}
  }

  const topicDiff = arrayDiff(keys(tokenDoc.currentTopics), keys(tokenDoc.desiredTopics))

  if (topicDiff.added.length === 0 && topicDiff.deleted.length === 0) {
    // nothing to do
    return true
  }

  return topicManagment(tokenId, tokenDoc, topicDiff.added, topicDiff.deleted)
    .then(response => {
      console.log('handleWrite going to update currentTopics:', tokenDoc.currentTopics)
      return snap.ref.update({ currentTopics: tokenDoc.currentTopics })
    })
    .catch(error => console.error('handleWrite error:', error))
}

exports.createToken = functions.firestore
  .document('Users/{userId}/FCMTokens/{tokenId}')
  .onCreate((snap, context) => handleWrite(context.params.tokenId, snap))

exports.updateToken = functions.firestore
  .document('Users/{userId}/FCMTokens/{tokenId}')
  .onUpdate((change, context) => handleWrite(context.params.tokenId, change.after))

exports.deleteToken = functions.firestore
  .document('Users/{userId}/FCMTokens/{tokenId}')
  .onDelete((snap, context) => {
    const token = snap.data()
    console.log('deleteToken', token)
    if (token.defunct || token.currentTopics.length === 0) {
      // nothing to do
      return true
    }

    return keys(token.currentTopics).map(topic =>
      admin.messaging().unsubscribeFromTopic(context.params.tokenId, topic))
      .catch(error => console.error('deleteToken error:', error))
  })
