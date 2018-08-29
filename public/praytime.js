/* global Vue, firebase, google */

//
// GLOBALS / MAIN
//

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
    inputDisabled: false,
    message: '',
    messageClass: 'text-secondary',
    events: []
  }
})

const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone

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
db.settings({ timestampsInSnapshots: true })
// // TODO
// const messaging = firebase.messaging()
//
// messaging.usePublicVapidKey('BEgZlt2y5qeI4Ca3AV4s8eqyWIxMu4tYgN1ywYt1crenySm-hynwa72cEX1HMcKkfC0To9aNOPBcMv21MChqvmU')
//
// messaging.requestPermission()
//   .then(function () {
//     console.log('Notification permission granted.')
//     return messaging.getToken()
//   })
//   .then(function (token) {
//     console.log(token)
//   })
//   .catch(function (err) {
//     console.log('Unable to get permission to notify.', err)
//   })

const geocoder = new google.maps.Geocoder()
const autocomplete = new google.maps.places.Autocomplete(document.getElementById('autocomplete'), {
  types: [ 'geocode' ],
  fields: [ 'name', 'geometry.location' ]
})
autocomplete.addListener('place_changed', gmapsAutocompletePlaceChangeListener)

// If geolocation permission is granted, just load results for the current location automatically
try {
  if (!!navigator.permissions && !!navigator.geolocation) {
    navigator.permissions.query({name: 'geolocation'})
      .then(function (result) {
        if (result.state === 'granted') {
          getCurrentPosition()
        }
      })
      .catch(function (err) {
        console.log(err)
      })
  }
} catch (err) {
  console.log(err)
}

//
// FUNCTIONS
//

// gmaps autocomplete handler
function gmapsAutocompletePlaceChangeListener () {
  const place = autocomplete.getPlace()
  if (place.geometry) {
    // got results
    getPrayerTimesForLocation(place.name, place.geometry.location)
  } else {
    // need to do a search
    geocoder.geocode({ address: document.getElementById('autocomplete').value }, (results, status) => {
      if (status === 'OK') {
        getPrayerTimesForLocation(results[0].formatted_address, results[0].geometry.location)
      } else {
        vApp.message = 'Not found: ' + status
        vApp.messageClass = 'text-warning'
      }
    })
  }
}

// Query browser GPS info
function getCurrentPosition () {
  vApp.inputDisabled = true
  vApp.message = 'Getting current location...'
  vApp.messageClass = 'text-secondary'
  navigator.geolocation.getCurrentPosition((pos) => {
    vApp.inputDisabled = false
    getPrayerTimesForLocation(pos.coords.latitude + ',' + pos.coords.longitude, new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude))
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

// Perform firebase query for given location
function getPrayerTimesForLocation (locationDescription, location) {
  vApp.message = 'Getting prayer times for ' + locationDescription + '...'
  vApp.messageClass = 'text-secondary'

  // TODO: add geo bounds to this query
  // data set is small, so will filter in client for now
  db.collection('Events').get()
    .then((querySnapshotRef) => {
      const events = []
      for (const doc of querySnapshotRef.docs) {
        const evt = doc.data()
        const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(location, new google.maps.LatLng(evt.geo.latitude, evt.geo.longitude))
        if (searchRadiusMeters && distanceMeters > searchRadiusMeters) { continue }
        const distLabel = (distanceMeters * 0.000621371192).toFixed(2)
        const merged = Object.assign({
          distanceMeters: distanceMeters,
          distLabel: distLabel,
          diffTz: (userTz !== evt.timeZoneId),
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
        events.push(merged)
      }

      if (events.length) {
        // sort by distance
        events.sort((a, b) => { return a.distanceMeters - b.distanceMeters })
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
