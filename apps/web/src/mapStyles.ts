const lightMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f0f0ed' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5f5f5a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#aaa9a3' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#171715' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#43433f' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#edede9' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f5f5f2' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e2e5df' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8d7d2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e3e1dc' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#aaa59c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#d1d0cb' }] },
  { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfe1df' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#777873' }] },
]

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#10100f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#aaa9a5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#10100f' }, { weight: 3 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#464641' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#f3f3ef' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cecdc8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#121210' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#181816' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#171b17' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#292926' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111110' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3935' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#8c8880' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2d2d29' }] },
  { featureType: 'transit.station', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#080909' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#777873' }] },
]

export function mapStyleForTheme(theme: 'light' | 'dark') {
  return theme === 'dark' ? darkMapStyle : lightMapStyle
}
