/* global Vue, firebase, google */
const vApp = new Vue({
  el: '#app',
  data: {
    message: '',
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

const updatePosition = async (message, location) => {
  vApp.message = message

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
    updatePosition("Results for '" + place.name + "'", place.geometry.location)
  } else {
    // need to do a search
    geocoder.geocode({ address: document.getElementById('autocomplete').value }, (results, status) => {
      if (status === 'OK') {
        updatePosition("Results for '" + results[0].formatted_address + "'", results[0].geometry.location)
      } else {
        vApp.message = 'Not found: ' + status
      }
    })
  }
})

// Try to automatically get the user location from the browser
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition((pos) => {
    updatePosition('Results for: ' + pos.coords.latitude + ', ' + pos.coords.longitude, new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude))
  }, (error) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        // vApp.message = "Location permission denied, enter your location in the search box"
        break
      case error.POSITION_UNAVAILABLE:
        // vApp.message = "Location information is unavailable, enter your location in the search box"
        break
      case error.TIMEOUT:
      case error.UNKNOWN_ERROR:
      default:
        // vApp.message = "Enter your location in the search box."
        break
    }
  })
} else {
  // vApp.message = "Geolocation not supported by this browser"
}
