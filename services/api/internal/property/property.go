package property

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
}
