/* global Vue, firebase $ */

import { Loader } from '@googlemaps/js-api-loader'

import SunCalc from 'suncalc'

const geofire = require('geofire-common')

//
// GLOBALS / MAIN
//

// Init analytics library
const defaultAnalytics = firebase.analytics()
console.log('analytics loaded', defaultAnalytics)

const loader = new Loader({
  apiKey: 'AIzaSyC-GheSc0eKtS4paXu3SjJDsPGxA5WReRk',
  version: 'weekly',
  libraries: ['geometry', 'places']
})

const gmapsLoaderPromise = loader.load()

gmapsLoaderPromise.then(google => {
  const geocoder = new google.maps.Geocoder()
  const autocomplete = new google.maps.places.Autocomplete(document.getElementById('autocomplete'), {
    types: ['geocode'],
    fields: ['name', 'geometry.location']
  })
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace()
    if (place.geometry) {
      // got results
      getPrayerTimesForLocation(place.name, place.geometry.location, google)
    } else {
      // need to do a search
      geocoder.geocode({ address: document.getElementById('autocomplete').value }, (results, status) => {
        if (status === 'OK') {
          getPrayerTimesForLocation(results[0].formatted_address, results[0].geometry.location, google)
        } else {
          vApp.message = 'Not found: ' + status
          vApp.messageClass = 'text-warning'
        }
      })
    }
  })
}).catch(err => {
  console.error('[gmaps loader] error:', err)
})

// setup service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(function () {
      console.log('Service Worker Registered')
    })
}

// // TODO
// // capture add to homescreen event
// let deferredPrompt
//
// window.addEventListener('beforeinstallprompt', (e) => {
//   // Prevent Chrome 67 and earlier from automatically showing the prompt
//   e.preventDefault()
//   // Stash the event so it can be triggered later.
//   deferredPrompt = e
// })
//
// window.addEventListener('appinstalled', (evt) => {
//   console.log('added to home screen successfully')
// })

const vApp = new Vue({
  el: '#app',
  data: {
    signedIn: false,
    messagingSupported: firebase.messaging.isSupported(),
    notificationPermissionGranted: false,
    notificationPermissionAsked: false,
    fcmTokenRefreshed: false,
    topics: {},
    user: null,
    userDocRef: null,
    inputDisabled: false,
    message: '',
    messageClass: 'text-secondary',
    events: []
  },
  methods: {
    toggleNotification: function (event) {
      console.log('toggle notification', event.id)

      if (!this.signedIn) {
        console.log('user not signed in')
        return
      }

      if (!this.fcmTokenRefreshed) {
        console.log('no fcm token yet')
        return
      }

      if (event.subscribed) {
        delete this.user.topics[event.fcmTopic]
      } else {
        this.user.topics[event.fcmTopic] = true
      }

      this.userDocRef.set(this.user).then(function () {
        console.log('topics saved', event.id)
        // toggle on successful save
        event.subscribed = !event.subscribed
      })
    },
    toggleBookmark: function (event) {
      console.log('toggle bookmark', event.id)

      if (!this.signedIn) {
        console.log('user not signed in')
        return
      }

      if (event.bookmarked) {
        delete this.user.bookmarks[event.id]
      } else {
        this.user.bookmarks[event.id] = true
      }

      this.userDocRef.set(this.user).then(function () {
        console.log('bookmarks saved', event.id)
        // toggle on successful save
        event.bookmarked = !event.bookmarked
      })
    }
  }
})

const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const now = new Date()

const url = new URL(window.location.href)
// for (const p of url.searchParams.entries()) {
//   console.log(p)
// }

let searchRadiusMiles = 50
if (url.searchParams.has('r')) {
  const p = Number(url.searchParams.get('r'))
  if (!window.isNaN(p)) {
    searchRadiusMiles = p
  }
}
const searchRadiusMeters = searchRadiusMiles * 1609.344

const db = firebase.firestore()
// This is now the default setting
// db.settings({ timestampsInSnapshots: true })

// TODO
// db.enablePersistence()
//   .catch(function (err) {
//     if (err.code === 'failed-precondition') {
//       // Multiple tabs open, persistence can only be enabled
//       // in one tab at a a time.
//       // ...
//       console.error('firebase enablePersistence failed:', err)
//     } else if (err.code === 'unimplemented') {
//       // The current browser does not support all of the
//       // features required to enable persistence
//       // ...
//       console.error('firebase enablePersistence failed:', err)
//     }
//   })

let messaging = null

firebase.auth().onAuthStateChanged(function (u) {
  if (u) {
    console.log('[onAuthStateChanged] user signed in:', u.uid)
    vApp.userDocRef = db.collection('Users').doc(u.uid)
    vApp.userDocRef.get().then(function (user) {
      if (user.exists) {
        vApp.user = user.data()

        if (Object.keys(vApp.user.topics).length > 0 && vApp.events.length > 0) {
          // update events if already retrieved
          for (const event of vApp.events) {
            event.subscribed = event.fcmTopic in vApp.user.topics
          }
        }

        if (!('bookmarks' in vApp.user)) {
          vApp.user.bookmarks = {}
        } else {
          // update events if already retrieved
          if (Object.keys(vApp.user.bookmarks).length > 0) {
            if (vApp.events.length > 0) {
              for (const event of vApp.events) {
                event.bookmarked = event.id in vApp.user.bookmarks
              }
              // resort events
              vApp.events.sort(eventCmp)
            } else {
            // get bookmarked events
              console.log('getting bookmarked events')
              getById(db, 'Events', Object.keys(vApp.user.bookmarks)).then(function (results) {
                console.log('bookmarked events:', results)
                if (vApp.messagingSupported && !vApp.notificationPermissionGranted) {
                // if messaging supported, try and get permission for push notifications
                  askForNotificationPermission()
                }
                // Add bookmarked masaajid to beginning of results
                vApp.events = results.map(result => docToEvent(result))
              })
            }
          }
        }
        console.log('User data:', vApp.user)
        console.log('topics:', vApp.topics)
      } else {
        console.log('New user')
        vApp.user = {
          id: u.uid,
          topics: {},
          bookmarks: {}
        }
      }
      vApp.signedIn = true
      setupMessaging()
    }).catch(function (err) {
      console.log('Error getting document:', err)
    })
  } else {
    console.log('[onAuthStateChanged] new user')
    firebase.auth().signInAnonymously()
      .then(function (u) {
        if (u) {
          console.log('[signInAnonymously] user signed in:', u.user.uid)
        } else {
          console.error('[signInAnonymously] user is null')
        }
      })
      .catch(function (err) {
        console.error('[signInAnonymously] error:', err)
      })

    vApp.user = null
    vApp.signedIn = false
  }
})

// If geolocation permission is granted, just load results for the current location automatically
try {
  if ('permissions' in navigator) {
    navigator.permissions.query({ name: 'notifications' })
      .then(function (result) {
        if (result.state === 'granted') {
          vApp.notificationPermissionGranted = true
        }
      })
      .catch(function (err) {
        console.log(err)
      })

    if ('geolocation' in navigator) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(function (result) {
          if (result.state === 'granted') {
            getCurrentPosition()
          }
        })
        .catch(function (err) {
          console.log(err)
        })
    }
  }
} catch (err) {
  console.log(err)
}

//
// FUNCTIONS
//

function setupMessaging () {
  if (vApp.messagingSupported) {
    messaging = firebase.messaging()
    messaging.usePublicVapidKey('BEgZlt2y5qeI4Ca3AV4s8eqyWIxMu4tYgN1ywYt1crenySm-hynwa72cEX1HMcKkfC0To9aNOPBcMv21MChqvmU')

    // check if notification permission already granted:
    try {
      if (vApp.notificationPermissionGranted) {
        getMessagingToken()
      } else if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'notifications' })
          .then(function (result) {
            console.log('navigator.permissions.query for notifications result:', result)
            if (result.state === 'granted') {
              vApp.notificationPermissionGranted = true
              getMessagingToken()
            }
          })
          .catch(function (err) {
            console.log(err)
          })
      } else {
      // TODO: check persistent storage?
        // askForNotificationPermission()
      }
    } catch (err) {
      console.log(err)
      // TODO: check persistent storage?
      // askForNotificationPermission()
    }

    messaging.onTokenRefresh(function () {
      console.log('getting refreshed token')
      getMessagingToken()
    })

    // Handle incoming messages. Called when:
    // // - a message is received while the app has focus
    // // - the user clicks on an app notification created by a service worker
    // //   `messaging.setBackgroundMessageHandler` handler.
    messaging.onMessage(function (payload) {
      console.log('Message received. ', payload)
      window.alert(payload.notification.title + ': ' + payload.notification.body)
    })
  }
}

function getMessagingToken () {
  messaging.getToken().then(function (token) {
    console.log('Got fcm token', token)
    if (!vApp.signedIn) { throw new Error('Not signed in') }
    // write to subcollection
    // set-with-merge will create the doc if it doesn't exist, or only update the defunct field otherwise
    return db.collection('Users').doc(vApp.user.id).collection('FCMTokens').doc(token).set({ defunct: false }, { merge: true })
  }).then(function () {
    vApp.fcmTokenRefreshed = true
    console.log('fcmToken written')
  }).catch(function (err) {
    console.log('Unable to retrieve/save refreshed token ', err)
  })
}

function askForNotificationPermission () {
  if (!vApp.notificationPermissionGranted) {
    if (vApp.notificationPermissionAsked) {
      // already asked
      return
    }
    vApp.notificationPermissionAsked = true
    console.log('asking for notification permission')
    $('#notificationPermissionRequestModal').modal({})
    $('#enableNotificationButton').on('click', function (e) {
      console.log('browser api request notification permission')
      try {
        messaging.requestPermission()
          .then(function () {
            console.log('Notification permission granted.')
            vApp.notificationPermissionGranted = true
            getMessagingToken()
          })
          .catch(function (err) {
            console.log('Unable to get permission to notify.', err)
          })
      } catch (err) {
        console.log(err)
      }
    })
  } else {
    console.log('permission already granted')
    getMessagingToken()
  }
}

// Query browser GPS info
function getCurrentPosition () {
  vApp.inputDisabled = true
  vApp.message = 'Getting current location...'
  vApp.messageClass = 'text-secondary'
  navigator.geolocation.getCurrentPosition((pos) => {
    vApp.inputDisabled = false
    gmapsLoaderPromise.then(google => {
      getPrayerTimesForLocation('current location', new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude), google)
    }).catch(err => {
      console.error('[gmaps loader] error:', err)
    })
  }, (error) => {
    vApp.inputDisabled = false
    switch (error.code) {
      case error.PERMISSION_DENIED:
        vApp.message = 'The browser denied the request for current location, please enable this in your browser settings or enter your location (address or city) in the search box above.'
        vApp.messageClass = 'text-info'
        break
      case error.POSITION_UNAVAILABLE:
      case error.TIMEOUT:
        vApp.message = 'Location information is unavailable, please enter your location (address or city) in the search box above.'
        vApp.messageClass = 'text-info'
        break
      case error.UNKNOWN_ERROR:
      default:
        vApp.message = 'Please enter your location (address or city) in the search box above.'
        vApp.messageClass = 'text-info'
        break
    }
  })
}
// "export" so it can be called from index.html
// https://stackoverflow.com/a/56805689
window.getCurrentPosition = getCurrentPosition

function docToEvent (doc) {
  const evt = doc.data()

  const times = SunCalc.getTimes(now, evt.geo.latitude, evt.geo.longitude)
  const fcmTopic = '/topics/' + doc.id

  const merged = Object.assign({
    id: doc.id,
    fcmTopic: fcmTopic,
    bookmarked: vApp.signedIn && (doc.id in vApp.user.bookmarks),
    subscribed: vApp.signedIn && (fcmTopic in vApp.user.topics),
    // distanceMeters: distanceMeters,
    distLabel: '-',
    diffTz: (userTz !== evt.timeZoneId),
    sunrise: hourMinuteString(times.sunrise, evt.timeZoneId),
    sunset: hourMinuteString(times.sunset, evt.timeZoneId),
    fajrIsModified: (evt.fajrIqamaModified && hoursSince(evt.fajrIqamaModified.toDate()) < 24),
    zuhrIsModified: (evt.zuhrIqamaModified && hoursSince(evt.zuhrIqamaModified.toDate()) < 24),
    asrIsModified: (evt.asrIqamaModified && hoursSince(evt.asrIqamaModified.toDate()) < 24),
    maghribIsModified: (evt.maghribIqamaModified && hoursSince(evt.maghribIqamaModified.toDate()) < 24),
    ishaIsModified: (evt.ishaIqamaModified && hoursSince(evt.ishaIqamaModified.toDate()) < 24),
    juma1IsModified: (evt.juma1Modified && hoursSince(evt.juma1Modified.toDate()) < 24),
    juma2IsModified: (evt.juma2Modified && hoursSince(evt.juma2Modified.toDate()) < 24),
    juma3IsModified: (evt.juma3Modified && hoursSince(evt.juma3Modified.toDate()) < 24),
    updatedLabel: timeSince(evt.crawlTime.toDate()),
    stale: (hoursSince(evt.crawlTime.toDate()) > 12)
  }, evt)
  return merged
}

// multi-get array of ids rooted at path
function getById (firestore, path, ids) {
  return Promise.all([].concat(ids).map(id => firestore.doc(path + '/' + id).get()))
}

function eventCmp (a, b) {
  if (a.bookmarked !== b.bookmarked) {
    // if a is bookmarked and b is not, return -1 so a ranks higher in the list
    return a.bookmarked ? -1 : 1
  } else {
    // bookmarks same value, sort by distance
    return a.distanceMeters - b.distanceMeters
  }
}

// Perform firebase query for given location
function getPrayerTimesForLocation (locationDescription, location, google) {
  vApp.message = 'Getting prayer times for ' + locationDescription + '...'
  vApp.messageClass = 'text-secondary'

  // Each item in 'bounds' represents a startAt/endAt pair. We have to issue
  // a separate query for each pair. There can be up to 9 pairs of bounds
  // depending on overlap, but in most cases there are 4.
  const bounds = geofire.geohashQueryBounds([location.lat(), location.lng()], searchRadiusMeters)
  const promises = []
  for (const b of bounds) {
    const q = db.collection('Events')
      .orderBy('geohash')
      .startAt(b[0])
      .endAt(b[1])

    promises.push(q.get())
  }

  Promise.all(promises).then((querySnapshotRefs) => {
    const events = []
    for (const querySnapshotRef of querySnapshotRefs) {
      for (const doc of querySnapshotRef.docs) {
        const evt = doc.data()
        const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(location, new google.maps.LatLng(evt.geo.latitude, evt.geo.longitude))

        const distLabel = (distanceMeters * 0.000621371192).toFixed(2)
        const merged = docToEvent(doc)

        // filter out non-bookmarked results outside search radius
        if (searchRadiusMeters && distanceMeters > searchRadiusMeters && !merged.bookmarked) {
          continue
        }

        merged.distanceMeters = distanceMeters
        merged.distLabel = distLabel

        events.push(merged)
      }
    }

    if (events.length) {
      if (vApp.messagingSupported && !vApp.notificationPermissionGranted) {
        // if messaging supported, try and get permission for push notifications
        askForNotificationPermission()
      }
      console.log('sorting events')
      // sort by distance
      events.sort(eventCmp)
      vApp.message = 'Prayer times within ' + searchRadiusMiles + ' miles of ' + locationDescription
      vApp.messageClass = 'text-success'
      vApp.events = events
    } else {
      vApp.message = 'No prayer times found within ' + searchRadiusMiles + ' miles of ' + locationDescription
      vApp.messageClass = 'text-info'
    }
  })
    .catch((err) => {
      vApp.message = err
      vApp.messageClass = 'text-danger'
    })
}

function hourMinuteString (date, tz) {
  try {
    return date.toLocaleTimeString([], {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric'
    })
  } catch (err) {
    console.log(err)
  }
}

function hoursSince (date) {
  return Math.floor((new Date() - date) / (1000 * 60 * 60))
}

function timeSince (date) {
  let secondsSince = Math.floor((new Date() - date) / 1000)
  const returnValue = []

  const units = [
    {
      k: 'years',
      v: 60 * 60 * 24 * 365
    },
    {
      k: 'months',
      v: 60 * 60 * 24 * 30
    },
    {
      k: 'weeks',
      v: 60 * 60 * 24 * 7
    },
    {
      k: 'days',
      v: 60 * 60 * 24
    },
    {
      k: 'hours',
      v: 60 * 60
    },
    {
      k: 'minutes',
      v: 60
    }
  ]

  for (const unit of units) {
    const interval = Math.floor(secondsSince / unit.v)
    if (interval > 0) {
      returnValue.push(interval + ' ' + unit.k)
      secondsSince -= interval * unit.v
    }
  }

  if (Object.keys(returnValue).length > 0) {
    return returnValue.join(', ') + ', and ' + secondsSince + ' seconds'
  }

  return secondsSince + ' seconds'
}
