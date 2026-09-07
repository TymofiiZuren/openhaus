package mediafingerprint

import (
	"image"
	"image/color"
	"math/bits"
	"math/rand/v2"
	"reflect"
	"sort"
	"testing"
)

func TestHashUniformAndGradient(t *testing.T) {
	for _, descending := range []bool{false, true} {
		img := image.NewGray(image.Rect(3, 5, 93, 85))
		for y := 5; y < 85; y++ {
			for x := 3; x < 93; x++ {
				v := uint8((x - 3) * 2)
				if descending {
					v = 255 - v
				}
				img.SetGray(x, y, color.Gray{Y: v})
			}
		}
		got, err := Hash(img)
		if err != nil {
			t.Fatal(err)
		}
		var want uint64
		if descending {
			want = ^uint64(0)
		}
		if got != want {
			t.Fatalf("hash %x, want %x", got, want)
		}
	}
	if _, err := Hash(image.NewGray(image.Rect(0, 0, 2, 2))); err == nil {
		t.Fatal("small image accepted")
	}
}

func TestIndexMatchesBruteForce(t *testing.T) {
	var tree Tree
	rng := rand.New(rand.NewPCG(19, 31))
	values := make([]uint64, 300)
	for i := range values {
		values[i] = rng.Uint64()
		tree.Add(i, values[i])
	}
	values = append(values, values[0])
	tree.Add(300, values[0])
	for _, radius := range []int{0, 1, 8, 32, 64} {
		for _, query := range values[:10] {
			var want []Match
			for id, h := range values {
				d := bits.OnesCount64(query ^ h)
				if d <= radius {
					want = append(want, Match{ID: id, Distance: d})
				}
			}
			sort.Slice(want, func(i, j int) bool {
				if want[i].Distance == want[j].Distance {
					return want[i].ID < want[j].ID
				}
				return want[i].Distance < want[j].Distance
			})
			if got := tree.Search(query, radius); !reflect.DeepEqual(got, want) {
				t.Fatalf("radius %d differs from brute force", radius)
			}
		}
	}
	if got := tree.Search(0, -1); len(got) != 0 {
		t.Fatal("negative radius accepted")
	}
}
