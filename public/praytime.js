/* global Vue, firebase, google */
const vApp = new Vue({
  el: '#app',
  data: {
    message: '',
    messageClass: 'text-secondary',
    events: []
  }
})

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
    // doc.data() is never undefined for query doc snapshots
    // console.log(doc.id, " => ", doc.data());
    const evt = doc.data()
    const geo = evt.geo
    const distance = google.maps.geometry.spherical.computeDistanceBetween(location, new google.maps.LatLng(geo.latitude, geo.longitude))
    const distLabel = (distance * 0.000621371192).toFixed(2)
    const merged = Object.assign({ distance: distance, distLabel: distLabel }, evt)
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
