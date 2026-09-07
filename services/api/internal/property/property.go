package property

import (
	"errors"
	"time"
)

var ErrSavedSearchLimit = errors.New("saved search limit reached")

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

// ManagedProperty includes lifecycle state for authenticated managers.
type ManagedProperty struct {
	Property
	Status string `json:"status"`
}

// ManagedPropertyInput is the editable listing contract used by managers.
type ManagedPropertyInput struct {
	Title        string  `json:"title"`
	AddressLine1 string  `json:"addressLine1"`
	City         string  `json:"city"`
	County       string  `json:"county"`
	PriceCents   int64   `json:"priceCents"`
	Bedrooms     int16   `json:"bedrooms"`
	PropertyType string  `json:"propertyType"`
	Longitude    float64 `json:"longitude"`
	Latitude     float64 `json:"latitude"`
	Status       string  `json:"status"`
}

// Media is an ordered visual asset belonging to a property.
type Media struct {
	URL      string `json:"url"`
	Kind     string `json:"kind"`
	AltText  string `json:"altText"`
	Position int16  `json:"position"`
}

// ClientPropertyNote is private buyer-owned context for one published home.
type ClientPropertyNote struct {
	PropertyID string    `json:"propertyId"`
	Notes      string    `json:"notes"`
	Questions  []string  `json:"questions"`
	UpdatedAt  time.Time `json:"updatedAt,omitempty"`
}

// ClientSavedSearch is a buyer-owned catalogue filter set. Delivery is kept as
// an explicit preference; creating a record does not imply that email delivery
// has been configured.
type ClientSavedSearch struct {
	ID              string    `json:"id"`
	Location        string    `json:"location"`
	County          string    `json:"county,omitempty"`
	Area            string    `json:"area,omitempty"`
	Query           string    `json:"query,omitempty"`
	MinimumBedrooms int16     `json:"minimumBedrooms"`
	PropertyType    string    `json:"propertyType"`
	MaximumPrice    int64     `json:"maximumPrice"`
	SpatialOnly     bool      `json:"spatialOnly"`
	Frequency       string    `json:"frequency"`
	CreatedAt       time.Time `json:"createdAt"`
}

// ClientDataExport contains the buyer-owned records that can be exported
// without exposing authentication secrets or session material.
type ClientDataExport struct {
	SavedPropertyIDs []string             `json:"savedPropertyIds"`
	SavedSearches    []ClientSavedSearch  `json:"savedSearches"`
	PropertyNotes    []ClientPropertyNote `json:"propertyNotes"`
}
