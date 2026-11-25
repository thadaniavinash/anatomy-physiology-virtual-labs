/* =====================================================================
   Hand photo with adjustable skin tone.
   Recolours the photo pixel-by-pixel on a canvas. If the browser blocks
   pixel access (e.g. the page is opened straight from disk with file://),
   it falls back to approximate CSS filters.
   ===================================================================== */
window.Hand = (function () {
  const SRC = 'assets/hand.webp';
  const REF = [211, 153, 136];                  // median skin colour of the original photo
  // Target palm tones (palms are lighter than the back of the hand for every skin tone)
  const TONES = [
    { label: 'Original', swatch: '#d39988', rgb: null, filter: 'none' },
    { label: 'Light', swatch: '#f0c8b2', rgb: [236, 196, 172], filter: 'brightness(1.08) saturate(.85)' },
    { label: 'Medium', swatch: '#c99572', rgb: [198, 146, 112], filter: 'brightness(.9) sepia(.18) saturate(1.05)' },
    { label: 'Tan', swatch: '#a8714e', rgb: [172, 116, 84], filter: 'brightness(.76) sepia(.28) saturate(1.1)' },
    { label: 'Brown', swatch: '#8a5638', rgb: [146, 94, 66], filter: 'brightness(.63) sepia(.32) saturate(1.15)' },
    { label: 'Deep', swatch: '#6a3f28', rgb: [118, 76, 54], filter: 'brightness(.52) sepia(.36) saturate(1.2)' }
  ];

  let img, canvas, base = null, pixelOK = true;

  function render(i) {
    const tone = TONES[i];
    if (!pixelOK || !base) { canvas.style.filter = tone.filter; return; }
    canvas.style.filter = 'none';
    const ctx = canvas.getContext('2d');
    if (!tone.rgb) { ctx.putImageData(base, 0, 0); return; }
    const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    const d = out.data, k = tone.rgb.map((v, j) => v / REF[j]);
    for (let p = 0; p < d.length; p += 4) {
      if (!d[p + 3]) continue;
      d[p] = d[p] * k[0]; d[p + 1] = d[p + 1] * k[1]; d[p + 2] = d[p + 2] * k[2];
    }
    ctx.putImageData(out, 0, 0);
  }

  function init(canvasEl, swatchHost, onReady) {
    canvas = canvasEl;
    img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try { base = ctx.getImageData(0, 0, canvas.width, canvas.height); }
      catch (e) { pixelOK = false; }
      render(0);
      if (onReady) onReady();
    };
    img.src = SRC;
    swatchHost.innerHTML = '<span>Skin tone</span>' + TONES.map((t, i) =>
      `<button class="swatch${i === 0 ? ' on' : ''}" data-i="${i}" style="background:${t.swatch}" aria-label="${t.label} skin tone" title="${t.label}"></button>`).join('');
    swatchHost.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => {
      swatchHost.querySelectorAll('.swatch').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); render(+b.dataset.i);
    }));
  }

  // Fingertip position as a fraction of the image (where the blood drop hangs)
  const TIP = { x: 0.958, y: 0.462 };

  return { init, TIP };
})();
