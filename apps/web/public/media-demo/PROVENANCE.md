# Fictional coastal-house samples

Created 2026-09-07 with the built-in image generation tool. These are AI-generated concepts, not photographs of real listings. No actual address, price, measured floor plan or real property identity is asserted.

- `coastal-exterior.jpg`: a modest contemporary Irish coastal house, charcoal zinc gabled roof, pale grey lime render, timber entrance, native grasses, distant Atlantic sea, overcast daylight, three-quarter exterior architectural view; no people, logos or lettering.
- `coastal-interior.jpg`: fictional Irish coastal living room, oak floor, charcoal-framed glazing, Atlantic view, pale grey plaster, grey sofa and oak joinery, overcast daylight; no people, logos or lettering. Generated independently; exact geometry continuity is not guaranteed.
- `coastal-study.mp4`: FFmpeg dissolve between these two stills, 1280×854, 24 fps, H.264, seven seconds, no audio. This is not filmed footage or a walkthrough.

Generation prompts specified `photorealistic-natural`, landscape 1536×1024, editorial architectural photography and fictional portfolio samples. JPEG derivatives use FFmpeg `-q:v 3`; the installed FFmpeg does not include the libwebp encoder. Video uses `xfade=transition=fade:duration=1:offset=3`, libx264 CRF 24 and `+faststart`.

## Exact generation prompts

Exterior: Use case: photorealistic-natural. Asset type: fictional property sample for a software engineering portfolio, not a real listing. Create a single landscape editorial architectural photograph of a contemporary Irish coastal house: modest two-storey gabled form, charcoal zinc roof, pale grey lime render, timber entrance, large glazing, native grasses, distant Atlantic sea, soft overcast daylight with realistic shadow detail. Three-quarter exterior view, complete building visible, natural materials and restrained premium photography. No people, logos, lettering, collage or watermark. 1536x1024 landscape.

Interior: Use case: photorealistic-natural. Asset type: fictional property sample for a software portfolio. Single landscape architectural interior photograph inside an Irish coastal contemporary house: oak floor, charcoal-framed floor-to-ceiling glazing looking to native grass and Atlantic sea, pale grey plaster walls, simple low grey sofa, oak joinery, a reading chair and uncluttered living space. Soft overcast daylight, realistic highlights and shadow, premium editorial composition, credible modest scale. No people, text, branding, collage or watermark. 1536x1024.
