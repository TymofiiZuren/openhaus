#include "cubemap.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>

void require(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}

void verifyGeometry() {
    using namespace panorama;
    // An independent spherical direction field: RGB represents world X/Y/Z.
    // Smooth values across the longitude seam expose orientation without relying
    // on projectRows to calculate the expected cube-face samples.
    constexpr double pi = 3.14159265358979323846;
    Image sphere{1024, 512, std::vector<Pixel>(1024 * 512)};
    for (int y = 0; y < sphere.height; ++y) {
        const double latitude = pi * (0.5 - (y + 0.5) / sphere.height);
        for (int x = 0; x < sphere.width; ++x) {
            const double longitude = 2 * pi * ((x + 0.5) / sphere.width - 0.5);
            sphere.pixels[y * sphere.width + x] = {
                128 + 100 * std::sin(longitude) * std::cos(latitude),
                128 + 100 * std::sin(latitude),
                128 + 100 * std::cos(longitude) * std::cos(latitude)};
        }
    }
    // Top-left, top-right, bottom-left, bottom-right of each 3x3 face.
    // Integer vectors are proportional to the rays through those texel centres.
    const std::array<std::array<Pixel, 4>, 6> corners{{
        {{{-2, 2, 3}, {2, 2, 3}, {-2, -2, 3}, {2, -2, 3}}},
        {{{3, 2, 2}, {3, 2, -2}, {3, -2, 2}, {3, -2, -2}}},
        {{{2, 2, -3}, {-2, 2, -3}, {2, -2, -3}, {-2, -2, -3}}},
        {{{-3, 2, -2}, {-3, 2, 2}, {-3, -2, -2}, {-3, -2, 2}}},
        {{{-2, 3, -2}, {2, 3, -2}, {-2, 3, 2}, {2, 3, 2}}},
        {{{-2, -3, 2}, {2, -3, 2}, {-2, -3, -2}, {2, -3, -2}}}
    }};
    const auto close = [](Pixel actual, Pixel expected, double tolerance) {
        return std::abs(actual.r - expected.r) < tolerance &&
               std::abs(actual.g - expected.g) < tolerance &&
               std::abs(actual.b - expected.b) < tolerance;
    };
    for (std::size_t face = 0; face < faces.size(); ++face) {
        const auto output = project(sphere, faces[face], 3);
        for (int corner = 0; corner < 4; ++corner) {
            const auto ray = corners[face][corner];
            const double length = std::sqrt(ray.r * ray.r + ray.g * ray.g + ray.b * ray.b);
            const Pixel expected{128 + 100 * ray.r / length,
                                 128 + 100 * ray.g / length,
                                 128 + 100 * ray.b / length};
            require(close(output.pixels[(corner / 2) * 6 + (corner % 2) * 2], expected, 0.002),
                    "off-centre face orientation");
        }
    }
    enum class Edge { left, right, top, bottom };
    struct Join { Face a; Edge edgeA; Face b; Edge edgeB; bool reverse; };
    const std::array<Join, 12> joins{{
        {Face::front, Edge::left, Face::left, Edge::right, false},
        {Face::front, Edge::right, Face::right, Edge::left, false},
        {Face::front, Edge::top, Face::top, Edge::bottom, false},
        {Face::front, Edge::bottom, Face::bottom, Edge::top, false},
        {Face::back, Edge::left, Face::right, Edge::right, false},
        {Face::back, Edge::right, Face::left, Edge::left, false},
        {Face::back, Edge::top, Face::top, Edge::top, true},
        {Face::back, Edge::bottom, Face::bottom, Edge::bottom, true},
        {Face::left, Edge::top, Face::top, Edge::left, false},
        {Face::left, Edge::bottom, Face::bottom, Edge::left, true},
        {Face::right, Edge::top, Face::top, Edge::right, true},
        {Face::right, Edge::bottom, Face::bottom, Edge::right, false}
    }};
    constexpr int size = 128;
    std::array<Image, 6> output;
    for (std::size_t i = 0; i < faces.size(); ++i) output[i] = project(sphere, faces[i], size);
    const auto edgePixel = [&](Face face, Edge edge, int index) {
        const int x = edge == Edge::left ? 0 : edge == Edge::right ? size - 1 : index;
        const int y = edge == Edge::top ? 0 : edge == Edge::bottom ? size - 1 : index;
        return output[static_cast<std::size_t>(face)].pixels[y * size + x];
    };
    for (const auto& join : joins) {
        for (int i = 0; i < size; ++i) {
            // Adjacent texel centres approach, but do not lie on, the same edge.
            require(close(edgePixel(join.a, join.edgeA, i),
                          edgePixel(join.b, join.edgeB, join.reverse ? size - 1 - i : i), 1.0),
                    "adjacent cube edges remain continuous");
        }
    }
}

int main() {
    using namespace panorama;
    // RGB encodes longitude and latitude, making orientation observable.
    Image source{8, 4, std::vector<Pixel>(32)};
    for (int y = 0; y < 4; ++y)
        for (int x = 0; x < 8; ++x)
            source.pixels[y * 8 + x] = Pixel{double(x), double(y), 42};
    auto front = project(source, Face::front, 1);
    auto right = project(source, Face::right, 1);
    auto left = project(source, Face::left, 1);
    require(std::abs(front.pixels[0].r - 3.5) < 1e-9, "front longitude");
    require(std::abs(right.pixels[0].r - 5.5) < 1e-9, "right longitude");
    require(std::abs(left.pixels[0].r - 1.5) < 1e-9, "left longitude");
    require(std::abs(front.pixels[0].g - 1.5) < 1e-9, "equator latitude");
    require(project(source, Face::top, 1).pixels[0].g == 0, "north pole clamps");
    require(project(source, Face::bottom, 1).pixels[0].g == 3, "south pole clamps");
    require(std::abs(project(source, Face::back, 1).pixels[0].r - 3.5) < 1e-9, "longitude seam wraps");
    for (auto face : faces) {
        auto output = project(source, face, 16);
        require(output.pixels.size() == 256, "face dimensions");
        for (auto p : output.pixels) require(std::abs(p.b - 42) < 1e-9, "constant channel survives interpolation");
        int rows = 0;
        projectRows(source, face, 16, [&](int row, const std::vector<Pixel>& pixels) {
            require(row == rows++, "rows delivered in order");
            require(pixels.size() == 16, "one row buffer");
            for (int col = 0; col < 16; ++col) {
                const auto expected = output.pixels[row * 16 + col];
                require(pixels[col].r == expected.r && pixels[col].g == expected.g && pixels[col].b == expected.b,
                        "streamed pixels match full image");
            }
        });
        require(rows == 16, "all rows delivered");
    }
    int delivered = 0;
    try {
        projectRows(source, Face::front, 16, [&](int, const std::vector<Pixel>&) {
            ++delivered;
            throw std::runtime_error("sink failed");
        });
        require(false, "sink failure must propagate");
    } catch (const std::runtime_error& error) {
        require(std::string(error.what()) == "sink failed", "original sink error preserved");
    }
    require(delivered == 1, "stop immediately on sink failure");
    auto rejects = [&](const Image& input, int size) {
        try { project(input, Face::front, size); } catch (const std::invalid_argument&) { return true; }
        return false;
    };
    require(rejects(source, 0), "zero face size rejected");
    require(rejects(source, 4097), "oversized face rejected");
    require(rejects(Image{8, 4, {}}, 1), "truncated pixels rejected");
    require(rejects(Image{4, 4, std::vector<Pixel>(16)}, 1), "non equirectangular ratio rejected");
    verifyGeometry();
    std::cout << "Cubemap orientation, all 12 edge joins, seam, poles, interpolation and bounds passed\n";
}
