/* global Vue, firebase, google */
const vApp = new Vue({
  el: '#app',
  data: {
    message: '',
    messageClass: 'text-secondary',
    events: []
  }
})

const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone

function getFirebaseDb () {
  // Initialize Firebase
  const fbApp = firebase.initializeApp({ projectId: 'praytime-b76cb' })
  const db = firebase.firestore(fbApp)
  db.settings({ timestampsInSnapshots: true })
  return db
}

const db = getFirebaseDb()

const updatePosition = async (locationDescription, location) => {
  vApp.message = 'Getting prayer times for ' + locationDescription + '...'
  vApp.messageClass = 'text-secondary'

  const events = []

  // TODO: add geo bounds to this query
  const querySnapshotRef = await db.collection('Events').get()
  for (const doc of querySnapshotRef.docs) {
    const evt = doc.data()
    const geo = evt.geo
    const distance = google.maps.geometry.spherical.computeDistanceBetween(location, new google.maps.LatLng(geo.latitude, geo.longitude))
    const distLabel = (distance * 0.000621371192).toFixed(2)
    const merged = Object.assign({
      distance: distance,
      distLabel: distLabel,
      diffTz: (userTz !== evt.timeZoneId),
      fajrModified: (evt.fajrIqamaModified && hoursSince(evt.fajrIqamaModified.toDate()) < 24),
      zuhrModified: (evt.zuhrIqamaModified && hoursSince(evt.zuhrIqamaModified.toDate()) < 24),
      asrModified: (evt.asrIqamaModified && hoursSince(evt.asrIqamaModified.toDate()) < 24),
      maghribModified: (evt.maghribIqamaModified && hoursSince(evt.maghribIqamaModified.toDate()) < 24),
      ishaModified: (evt.ishaIqamaModified && hoursSince(evt.ishaIqamaModified.toDate()) < 24),
      juma1Modified: (evt.juma1Modified && hoursSince(evt.juma1Modified.toDate()) < 24),
      juma2Modified: (evt.juma2Modified && hoursSince(evt.juma2Modified.toDate()) < 24),
      juma3Modified: (evt.juma3Modified && hoursSince(evt.juma3Modified.toDate()) < 24),
      updatedLabel: timeSince(evt.crawlTime.toDate())
    }, evt)
    events.push(merged)
  }

  // sort by distance
  events.sort((a, b) => { return a.distance - b.distance })

  vApp.message = 'Prayer times for ' + locationDescription
  vApp.messageClass = 'text-success'
  vApp.events = events
}

const geocoder = new google.maps.Geocoder()
const autocomplete = new google.maps.places.Autocomplete(document.getElementById('autocomplete'), {
  types: [ 'geocode' ],
  fields: [ 'name', 'geometry.location' ]
})
autocomplete.addListener('place_changed', () => {
  const place = autocomplete.getPlace()
  if (place.geometry) {
    // got results
    updatePosition(place.name, place.geometry.location)
  } else {
    // need to do a search
    geocoder.geocode({ address: document.getElementById('autocomplete').value }, (results, status) => {
      if (status === 'OK') {
        updatePosition(results[0].formatted_address, results[0].geometry.location)
      } else {
        vApp.message = 'Not found: ' + status
        vApp.messageClass = 'text-warning'
      }
    })
  }
})

// Try to automatically get the user location from the browser
if (navigator.geolocation) {
  vApp.message = 'Getting current location...'
  vApp.messageClass = 'text-secondary'
  navigator.geolocation.getCurrentPosition((pos) => {
    updatePosition(pos.coords.latitude + ',' + pos.coords.longitude, new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude))
  }, (error) => {
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
} else {
  vApp.message = 'Please enter your location (address or city) in the search box above.'
  vApp.messageClass = 'text-info'
}

function hoursSince (date) {
  return Math.floor((new Date() - date) / (1000 * 60 * 60))
}

// https://stackoverflow.com/a/34901423
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
    if (interval > 1) {
      returnValue.push(interval + ' ' + unit.k)
    }
    secondsSince -= interval * unit.v
  }

  if (Object.keys(returnValue).length > 0) {
    return returnValue.join(', ') + ', and ' + secondsSince + ' seconds'
  }

  return secondsSince + ' seconds'
}
