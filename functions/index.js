/* globals require */
const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()

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

// Make appropriate calls to unsubscribe / subscribe topic.
function updateSubcription (userId, tokens, oldTopics, newTopics) {
  console.log('updateSubscription(',
    typeof userId, userId, ',',
    typeof tokens, tokens, ',',
    typeof oldTopics, oldTopics, ',',
    typeof newTopics, newTopics, ')')
  console.log(typeof tokens)
  const topics = arrayDiff(oldTopics, newTopics)
  // TODO: clean up tokens w/errors
  // const tokensToRemove = []
  topics.deleted.forEach((topic) => {
    admin.messaging().unsubscribeFromTopic(tokens, topic)
      .then(function (response) {
        console.log('Successfully unsubscribed from topic:', response)
      })
      .catch(function (error) {
        console.log('Error unsubscribing from topic:', error)
      })
  })

  topics.added.forEach((topic) => {
    admin.messaging().subscribeToTopic(tokens, topic)
      .then(function (response) {
        console.log('Successfully subscribed to topic:', response)
      })
      .catch(function (error) {
        console.log('Error subscribing to topic:', error)
      })
  })
}

exports.createUser = functions.firestore
  .document('Users/{userId}')
  .onCreate((snap, context) => {
    const newUser = snap.data()
    const tokens = Object.keys(newUser.fcmTokens)
    const newTopics = Object.keys(newUser.topics)
    console.log('New user: ', newUser)
    updateSubcription(newUser.id, tokens, null, newTopics)
  })

exports.updateUser = functions.firestore
  .document('Users/{userId}')
  .onUpdate((change, context) => {
    const newUser = change.after.data()
    const oldUser = change.before.data()
    const tokens = Object.keys(newUser.fcmTokens)
    const oldTopics = Object.keys(oldUser.topics)
    const newTopics = Object.keys(newUser.topics)
    console.log(typeof newUser.fcmTokens)
    console.log('Modify user, old: ', oldUser, ' new: ', newUser)
    updateSubcription(newUser.id, tokens, oldTopics, newTopics)
  })

exports.deleteUser = functions.firestore
  .document('Users/{userId}')
  .onDelete((snap, context) => {
    const oldUser = snap.data()
    const tokens = Object.keys(oldUser.fcmTokens)
    const oldTopics = Object.keys(oldUser.topics)
    console.log('Delete user: ', oldUser)
    updateSubcription(oldUser.id, tokens, oldTopics, null)
  })
