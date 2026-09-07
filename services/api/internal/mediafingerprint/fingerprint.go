// Package mediafingerprint provides advisory visual-similarity candidates.
// Hashes are not content identities and must never drive automatic deletion.
package mediafingerprint

import (
	"errors"
	"image"
	"image/color"
	"math/bits"
	"sort"
)

// Hash computes 64 horizontal comparisons over a 9×8 box-averaged grayscale
// grid. Sampling every source pixel avoids aliasing from single-point sampling.
// O(width*height) time, constant auxiliary memory. Version: dhash-box-v1.
func Hash(img image.Image) (uint64, error) {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w < 9 || h < 8 || w > 24_000_000/h {
		return 0, errors.New("image must be at least 9×8 and at most 24 megapixels")
	}
	var grid [8][9]uint64
	for gy := 0; gy < 8; gy++ {
		for gx := 0; gx < 9; gx++ {
			x0, x1 := gx*w/9, (gx+1)*w/9
			y0, y1 := gy*h/8, (gy+1)*h/8
			var sum uint64
			for y := y0; y < y1; y++ {
				for x := x0; x < x1; x++ {
					sum += uint64(color.GrayModel.Convert(img.At(b.Min.X+x, b.Min.Y+y)).(color.Gray).Y)
				}
			}
			grid[gy][gx] = sum / uint64((x1-x0)*(y1-y0))
		}
	}
	var hash uint64
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			hash <<= 1
			if grid[y][x] > grid[y][x+1] {
				hash |= 1
			}
		}
	}
	return hash, nil
}

type Match struct {
	ID       int `json:"id"`
	Distance int `json:"distance"`
}
type node struct {
	hash     uint64
	ids      []int
	children map[int]*node
}

// Tree is a BK-tree over Hamming distance, for single-owner construction/query.
// Triangle-inequality pruning is data dependent; worst-case queries remain O(n).
type Tree struct{ root *node }

func (t *Tree) Add(id int, hash uint64) {
	if t.root == nil {
		t.root = &node{hash: hash, ids: []int{id}, children: map[int]*node{}}
		return
	}
	current := t.root
	for {
		d := bits.OnesCount64(hash ^ current.hash)
		if d == 0 {
			current.ids = append(current.ids, id)
			return
		}
		next := current.children[d]
		if next == nil {
			current.children[d] = &node{hash: hash, ids: []int{id}, children: map[int]*node{}}
			return
		}
		current = next
	}
}
func (t *Tree) Search(hash uint64, radius int) []Match {
	if t.root == nil || radius < 0 {
		return nil
	}
	if radius > 64 {
		radius = 64
	}
	var found []Match
	stack := []*node{t.root}
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		d := bits.OnesCount64(hash ^ current.hash)
		if d <= radius {
			for _, id := range current.ids {
				found = append(found, Match{ID: id, Distance: d})
			}
		}
		for edge, child := range current.children {
			if edge >= d-radius && edge <= d+radius {
				stack = append(stack, child)
			}
		}
	}
	sort.Slice(found, func(i, j int) bool {
		if found[i].Distance == found[j].Distance {
			return found[i].ID < found[j].ID
		}
		return found[i].Distance < found[j].Distance
	})
	return found
}
