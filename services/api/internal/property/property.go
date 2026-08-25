package property

// Bounds is a WGS84 map viewport in west, south, east, north order.
type Bounds struct {
	West  float64
	South float64
	East  float64
	North float64
}

// Property is the public catalogue representation of a published home.
type Property struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	AddressLine1 string  `json:"addressLine1"`
	City         string  `json:"city"`
	County       string  `json:"county"`
	PriceCents   int64   `json:"priceCents"`
	Bedrooms     int16   `json:"bedrooms"`
	PropertyType string  `json:"propertyType"`
	Longitude    float64 `json:"longitude"`
	Latitude     float64 `json:"latitude"`
	Media        []Media `json:"media"`
}

// Media is an ordered visual asset belonging to a property.
type Media struct {
	URL      string `json:"url"`
	Kind     string `json:"kind"`
	AltText  string `json:"altText"`
	Position int16  `json:"position"`
}
