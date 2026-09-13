#include "cubemap.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>

void require(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
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
    std::cout << "Cubemap orientation, seam, poles, interpolation and bounds passed\n";
}
