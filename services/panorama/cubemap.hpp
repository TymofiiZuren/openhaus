#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace panorama {
struct Pixel { double r, g, b; };
struct Image { int width, height; std::vector<Pixel> pixels; };
enum class Face { front, right, back, left, top, bottom };
inline constexpr std::array<Face, 6> faces{Face::front, Face::right, Face::back, Face::left, Face::top, Face::bottom};

// Right-handed coordinates: +X right, +Y up, +Z front. Pixel rows run down.
// Each output texel is sampled at its centre; longitude wraps, latitude clamps.
// The callback borrows one reusable row; copy it if it must outlive the call.
// Exceptions from the consumer stop projection immediately.
template<class Consumer>
inline void projectRows(const Image& source, Face face, int size, Consumer consume) {
    if (source.height < 1 || source.height > 4096 || source.width != source.height * 2 ||
        source.pixels.size() != static_cast<std::size_t>(source.width) * source.height ||
        size < 1 || size > 4096)
        throw std::invalid_argument("Expected a complete 2:1 image up to 8192x4096 and face size 1..4096");
    if (std::find(faces.begin(), faces.end(), face) == faces.end())
        throw std::invalid_argument("Unknown cube face");
    std::vector<Pixel> output(size);
    constexpr double pi = 3.14159265358979323846;
    for (int row = 0; row < size; ++row) {
        const double v = 2.0 * (row + 0.5) / size - 1;
        for (int column = 0; column < size; ++column) {
            const double u = 2.0 * (column + 0.5) / size - 1;
            double x = 0, y = 0, z = 0;
            switch (face) {
                case Face::front: x = u; y = -v; z = 1; break;
                case Face::right: x = 1; y = -v; z = -u; break;
                case Face::back: x = -u; y = -v; z = -1; break;
                case Face::left: x = -1; y = -v; z = u; break;
                case Face::top: x = u; y = 1; z = v; break;
                case Face::bottom: x = u; y = -1; z = -v; break;
            }
            const double sx = (std::atan2(x, z) / (2 * pi) + 0.5) * source.width - 0.5;
            const double sy = std::clamp((0.5 - std::atan2(y, std::hypot(x, z)) / pi) * source.height - 0.5,
                                         0.0, double(source.height - 1));
            const int ix = static_cast<int>(std::floor(sx));
            const int iy = static_cast<int>(std::floor(sy));
            const double tx = sx - ix, ty = sy - iy;
            const auto sample = [&](int px, int py) {
                px = (px % source.width + source.width) % source.width;
                py = std::min(py, source.height - 1);
                return source.pixels[static_cast<std::size_t>(py) * source.width + px];
            };
            const auto mix = [](Pixel a, Pixel b, double t) {
                return Pixel{a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t};
            };
            output[column] =
                mix(mix(sample(ix, iy), sample(ix + 1, iy), tx),
                    mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), tx), ty);
        }
        consume(row, static_cast<const std::vector<Pixel>&>(output));
    }
}

inline Image project(const Image& source, Face face, int size) {
    Image output{size, size, {}};
    // Allocate only after projectRows has validated the request.
    projectRows(source, face, size, [&](int row, const std::vector<Pixel>& pixels) {
        if (row == 0) output.pixels.reserve(static_cast<std::size_t>(size) * size);
        output.pixels.insert(output.pixels.end(), pixels.begin(), pixels.end());
    });
    return output;
}
} // namespace panorama
