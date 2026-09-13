#include "cubemap.hpp"
#include <charconv>
#include <iostream>
#include <string_view>

int number(std::string_view text) {
    int result = 0;
    const auto parsed = std::from_chars(text.data(), text.data() + text.size(), result);
    if (parsed.ec != std::errc{} || parsed.ptr != text.data() + text.size())
        throw std::invalid_argument("Dimensions must be integers");
    return result;
}

int main(int argc, char** argv) {
    try {
        if (argc != 5) throw std::invalid_argument("Usage: panorama WIDTH HEIGHT FACE SIZE < rgb24.raw > face.ppm\nFACE: front, right, back, left, top, bottom");
        const int width = number(argv[1]), height = number(argv[2]), size = number(argv[4]);
        if (height < 1 || height > 4096 || width != height * 2 || size < 1 || size > 4096)
            throw std::invalid_argument("Expected 2:1 dimensions up to 8192x4096; face size 1..4096");
        constexpr std::array<std::string_view, 6> names{"front", "right", "back", "left", "top", "bottom"};
        auto face = std::find(names.begin(), names.end(), argv[3]);
        if (face == names.end()) throw std::invalid_argument("Unknown cube face");
        panorama::Image input{width, height, std::vector<panorama::Pixel>(static_cast<std::size_t>(width) * height)};
        for (auto& pixel : input.pixels) {
            unsigned char rgb[3];
            if (!std::cin.read(reinterpret_cast<char*>(rgb), 3)) throw std::runtime_error("Truncated RGB24 input");
            pixel = {double(rgb[0]), double(rgb[1]), double(rgb[2])};
        }
        if (std::cin.peek() != std::char_traits<char>::eof()) throw std::runtime_error("Extra RGB24 input: supply exactly one frame");
        if (std::cin.bad()) throw std::runtime_error("Input read failed");
        std::cout << "P6\n" << size << ' ' << size << "\n255\n";
        std::vector<unsigned char> encoded(static_cast<std::size_t>(size) * 3);
        panorama::projectRows(input, panorama::faces[face - names.begin()], size,
            [&](int, const std::vector<panorama::Pixel>& pixels) {
                for (std::size_t col = 0; col < pixels.size(); ++col) {
                    const auto pixel = pixels[col];
                    encoded[col * 3] = static_cast<unsigned char>(std::clamp(std::lround(pixel.r), 0L, 255L));
                    encoded[col * 3 + 1] = static_cast<unsigned char>(std::clamp(std::lround(pixel.g), 0L, 255L));
                    encoded[col * 3 + 2] = static_cast<unsigned char>(std::clamp(std::lround(pixel.b), 0L, 255L));
                }
                std::cout.write(reinterpret_cast<const char*>(encoded.data()), encoded.size());
                if (!std::cout) throw std::runtime_error("Output write failed");
            });
        std::cout.flush();
        if (!std::cout) throw std::runtime_error("Output write failed");
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "panorama: " << error.what() << '\n';
        return 1;
    }
}
