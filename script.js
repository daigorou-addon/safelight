(() => {
  const state = { img: null, file: null, naturalW:0, naturalH:0 };
  const IMAGE_TOOLS = ['compress','resize','convert','crop','transform','filter','crt','mosaic','round','grid','brightness','text','base64','bgremove'];

  // ---- ファイル読み込み（各ツールのcanvas自体がドロップ先） ----
  function loadImageForTool(file){
    if(!file || !file.type.startsWith('image/')) return;
    state.file = file;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.naturalW = img.naturalWidth;
      state.naturalH = img.naturalHeight;
      const activeTool = document.querySelector('nav.tools button.active').dataset.tool;
      refreshDropzoneStates();
      if(IMAGE_TOOLS.includes(activeTool)) initTool(activeTool);
    };
    img.src = url;
  }

  function refreshDropzoneStates(){
    document.querySelectorAll('.canvas-wrap[data-dropzone]').forEach(wrap => {
      wrap.classList.toggle('empty', !state.img);
    });
  }

  // 各ツールのcanvas-wrapをドロップ先兼クリック選択にする
  IMAGE_TOOLS.forEach(tool => {
    const ws = document.getElementById('ws-' + tool);
    if(!ws) return;
    const wrap = ws.querySelector('.canvas-wrap');
    if(!wrap) return;
    wrap.setAttribute('data-dropzone', '');
    wrap.classList.add('empty');
    const ph = document.createElement('div');
    ph.className = 'wrap-placeholder';
    ph.innerHTML = '<strong data-i18n="drop_title">画像をドラッグ&ドロップ</strong><span data-i18n="drop_sub">クリックしてファイルを選択（JPEG / PNG / WebP）</span>';
    wrap.appendChild(ph);

    wrap.addEventListener('dragover', e => {
      if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); wrap.classList.add('drag'); }
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
    wrap.addEventListener('drop', e => {
      if(!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); e.stopPropagation();
      wrap.classList.remove('drag');
      loadImageForTool(e.dataTransfer.files[0]);
    });
    wrap.addEventListener('click', () => {
      if(state.img) return;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', () => { if(inp.files[0]) loadImageForTool(inp.files[0]); });
      inp.click();
    });
  });

  // ---- ツール切り替え：切り替えるたびに画像はリセットし、そのツールのcanvasに再度ドロップしてもらう ----
  document.querySelectorAll('nav.tools button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav.tools button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.workspace').forEach(w => w.classList.remove('active'));
      state.img = null; state.file = null; state.naturalW = 0; state.naturalH = 0;
      document.getElementById('ws-' + btn.dataset.tool).classList.add('active');
      refreshDropzoneStates();
      if(btn.dataset.tool === 'stitch') drawStitchPreview();
    });
  });

  // ホーム画面のツールカードから該当ツールへ遷移
  document.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = document.querySelector(`nav.tools button[data-tool="${card.dataset.goto}"]`);
      if(target) target.click();
    });
  });

  function initTool(tool){
    if(tool === 'compress') drawToCanvas('cv-compress');
    if(tool === 'resize') { drawToCanvas('cv-resize'); document.getElementById('rW').value = state.naturalW; document.getElementById('rH').value = state.naturalH; }
    if(tool === 'convert') drawToCanvas('cv-convert');
    if(tool === 'crop') initCrop();
    if(tool === 'transform') { transformState = {rot:0, flipH:false, flipV:false}; drawToCanvas('cv-transform'); }
    if(tool === 'filter') { drawToCanvas('cv-filter'); applyFilterPreview(); }
    if(tool === 'crt') { drawToCanvas('cv-crt'); applyCrtPreview(); }
    if(tool === 'mosaic') initMosaic();
    if(tool === 'round') { drawToCanvas('cv-round'); applyRoundPreview(); }
    if(tool === 'grid') { ensureGridFracs(); drawGridLines(); }
    if(tool === 'brightness') applyBrightnessPreview();
    if(tool === 'text') applyTextPreview();
    if(tool === 'base64') drawToCanvas('cv-base64');
    if(tool === 'bgremove') drawToCanvas('cv-bgremove');
  }

  // ---- 高品質な縮小描画（段階的に半分ずつ縮小してから最終サイズへ） ----
  function drawImageHQ(destCtx, img, dw, dh, dx=0, dy=0){
    let srcW = img.naturalWidth || img.width;
    let srcH = img.naturalHeight || img.height;
    let src = img;
    while(srcW/2 > dw && srcH/2 > dh){
      const nw = Math.max(dw, Math.round(srcW/2));
      const nh = Math.max(dh, Math.round(srcH/2));
      const tmp = document.createElement('canvas');
      tmp.width = nw; tmp.height = nh;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, 0, 0, nw, nh);
      src = tmp; srcW = nw; srcH = nh;
    }
    destCtx.imageSmoothingEnabled = true;
    destCtx.imageSmoothingQuality = 'high';
    destCtx.drawImage(src, dx, dy, dw, dh);
  }

  function drawToCanvas(id){
    const cv = document.getElementById(id);
    const maxW = 460, maxH = 480;
    let w = state.naturalW, h = state.naturalH;
    const cssScale = Math.min(maxW/w, maxH/h, 1);
    const cssW = Math.max(1, Math.round(w*cssScale)), cssH = Math.max(1, Math.round(h*cssScale));
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    // 表示サイズ(CSS px)より内部解像度を高く保つことで、Canvasのぼやけを防ぐ
    const qualityMult = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    cv.width = Math.max(1, Math.round(cssW*qualityMult));
    cv.height = Math.max(1, Math.round(cssH*qualityMult));
    const ctx = cv.getContext('2d');
    drawImageHQ(ctx, state.img, cv.width, cv.height);
  }

  function fmtBytes(n){
    if(n < 1024) return n + ' B';
    if(n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    return (n/1024/1024).toFixed(2) + ' MB';
  }

  function download(blob, filename){
    const link = document.getElementById('dlLink');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function baseName(){
    const n = state.file ? state.file.name.replace(/\.[^.]+$/, '') : 'image';
    return n;
  }

  // ---- 圧縮 ----
  const qSlider = document.getElementById('quality');
  qSlider.addEventListener('input', () => document.getElementById('qVal').textContent = qSlider.value);
  document.getElementById('doCompress').addEventListener('click', () => {
    const fmt = document.getElementById('compressFmt').value;
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    cv.getContext('2d').drawImage(state.img, 0, 0);
    cv.toBlob(blob => {
      const ext = fmt === 'image/webp' ? 'webp' : 'jpg';
      download(blob, baseName() + '-compressed.' + ext);
      document.getElementById('compressMeta').innerHTML = t('msg_compress_done', {
        orig: '<b>'+fmtBytes(state.file.size)+'</b>', new: '<b>'+fmtBytes(blob.size)+'</b>',
        pct: Math.round((1-blob.size/state.file.size)*100)
      });
    }, fmt, qSlider.value/100);
  });

  // ---- リサイズ ----
  const rW = document.getElementById('rW'), rH = document.getElementById('rH'), rLock = document.getElementById('rLock');
  let ratio = 1;
  let resizeFmt = 'image/png';
  document.querySelectorAll('#resizeFmtChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#resizeFmtChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      resizeFmt = chip.dataset.fmt;
    });
  });
  rW.addEventListener('input', () => { if(rLock.checked){ ratio = state.naturalW/state.naturalH; rH.value = Math.round(rW.value/ratio); }});
  rH.addEventListener('input', () => { if(rLock.checked){ ratio = state.naturalW/state.naturalH; rW.value = Math.round(rH.value*ratio); }});
  document.getElementById('doResize').addEventListener('click', () => {
    const w = parseInt(rW.value), h = parseInt(rH.value);
    if(!w || !h) return;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if(resizeFmt === 'image/jpeg'){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h); }
    drawImageHQ(ctx, state.img, w, h);
    const ext = resizeFmt === 'image/jpeg' ? 'jpg' : resizeFmt.split('/')[1];
    const quality = resizeFmt === 'image/png' ? undefined : 0.92;
    cv.toBlob(blob => {
      download(blob, baseName() + `-${w}x${h}.${ext}`);
      document.getElementById('resizeMeta').innerHTML = t('msg_dims_size_done', {w:'<b>'+w, h:h+'</b>', size: fmtBytes(blob.size)});
    }, resizeFmt, quality);
  });

  // ---- 形式変換 ----
  let targetFmt = 'image/png';
  document.querySelectorAll('#fmtChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#fmtChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      targetFmt = chip.dataset.fmt;
    });
  });
  document.getElementById('doConvert').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    const ctx = cv.getContext('2d');
    if(targetFmt === 'image/jpeg'){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height); }
    ctx.drawImage(state.img, 0, 0);
    cv.toBlob(blob => {
      const ext = targetFmt.split('/')[1] === 'jpeg' ? 'jpg' : targetFmt.split('/')[1];
      download(blob, baseName() + '.' + ext);
      document.getElementById('convertMeta').innerHTML = `<b>${targetFmt}</b> — ` + t('msg_size_done', {size: fmtBytes(blob.size)});
    }, targetFmt, 0.92);
  });

  // ---- トリミング ----
  let cropAspect = null;
  let cropRect = {x:40,y:40,w:150,h:150};
  let cropImgScale = 1;
  const cropImg = document.getElementById('cropImg');
  const cropBox = document.getElementById('cropBox');
  const cropWrap = document.getElementById('cropOverlayWrap');

  function initCrop(){
    cropImg.src = state.img.src;
    cropImg.onload = () => {
      const maxW = 460;
      const scale = Math.min(maxW/state.naturalW, 480/state.naturalH, 1);
      cropImgScale = scale;
      cropImg.style.width = (state.naturalW*scale) + 'px';
      cropImg.style.height = (state.naturalH*scale) + 'px';
      cropWrap.style.width = (state.naturalW*scale) + 'px';
      cropWrap.style.height = (state.naturalH*scale) + 'px';
      cropRect = {x:0,y:0,w:state.naturalW*scale, h:state.naturalH*scale};
      applyCropBox();
    };
  }
  function applyCropBox(){
    cropBox.style.left = cropRect.x+'px';
    cropBox.style.top = cropRect.y+'px';
    cropBox.style.width = cropRect.w+'px';
    cropBox.style.height = cropRect.h+'px';
  }
  document.querySelectorAll('#aspectChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#aspectChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      cropAspect = chip.dataset.a === 'free' ? null : parseFloat(chip.dataset.a);
      if(cropAspect){ cropRect.h = cropRect.w / cropAspect; applyCropBox(); }
    });
  });
  let dragMode = null, dragStart = null;
  cropBox.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    dragMode = e.target.classList.contains('handle') ? [...e.target.classList].find(c=>c!=='handle') : 'move';
    dragStart = {x:e.clientX, y:e.clientY, rect:{...cropRect}};
  });
  document.addEventListener('mousemove', e => {
    if(!dragMode) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    const r = {...dragStart.rect};
    const maxW = state.naturalW*cropImgScale, maxH = state.naturalH*cropImgScale;
    if(dragMode === 'move'){
      r.x = Math.max(0, Math.min(maxW-r.w, r.x+dx));
      r.y = Math.max(0, Math.min(maxH-r.h, r.y+dy));
    } else {
      if(dragMode.includes('e')) r.w = Math.max(20, dragStart.rect.w+dx);
      if(dragMode.includes('s')) r.h = Math.max(20, dragStart.rect.h+dy);
      if(dragMode.includes('w')){ r.w = Math.max(20, dragStart.rect.w-dx); r.x = dragStart.rect.x+dx; }
      if(dragMode.includes('n')){ r.h = Math.max(20, dragStart.rect.h-dy); r.y = dragStart.rect.y+dy; }
      if(cropAspect) r.h = r.w/cropAspect;
    }
    cropRect = r;
    applyCropBox();
  });
  document.addEventListener('mouseup', () => dragMode = null);

  document.getElementById('doCrop').addEventListener('click', () => {
    const sx = cropRect.x/cropImgScale, sy = cropRect.y/cropImgScale;
    const sw = cropRect.w/cropImgScale, sh = cropRect.h/cropImgScale;
    const cv = document.createElement('canvas');
    cv.width = Math.round(sw); cv.height = Math.round(sh);
    cv.getContext('2d').drawImage(state.img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    cv.toBlob(blob => {
      download(blob, baseName() + '-crop.png');
      document.getElementById('cropMeta').innerHTML = t('msg_crop_done', {w:'<b>'+cv.width, h:cv.height+'</b>'});
    }, 'image/png');
  });

  // ---- 回転・反転 ----
  let transformState = {rot:0, flipH:false, flipV:false};
  function drawTransform(){
    const cv = document.getElementById('cv-transform');
    const maxW = 460, maxH = 460;
    let w = state.naturalW, h = state.naturalH;
    if(transformState.rot % 180 !== 0) [w,h] = [h,w];
    const scale = Math.min(maxW/w, maxH/h, 1);
    cv.width = Math.round(w*scale); cv.height = Math.round(h*scale);
    const ctx = cv.getContext('2d');
    ctx.save();
    ctx.translate(cv.width/2, cv.height/2);
    ctx.rotate(transformState.rot * Math.PI/180);
    ctx.scale(transformState.flipH ? -1:1, transformState.flipV ? -1:1);
    const dw = state.naturalW*scale, dh = state.naturalH*scale;
    ctx.drawImage(state.img, -dw/2, -dh/2, dw, dh);
    ctx.restore();
  }
  document.getElementById('rotL').addEventListener('click', () => { transformState.rot = (transformState.rot-90+360)%360; drawTransform(); });
  document.getElementById('rotR').addEventListener('click', () => { transformState.rot = (transformState.rot+90)%360; drawTransform(); });
  document.getElementById('flipH').addEventListener('click', () => { transformState.flipH = !transformState.flipH; drawTransform(); });
  document.getElementById('flipV').addEventListener('click', () => { transformState.flipV = !transformState.flipV; drawTransform(); });
  document.getElementById('doTransformSave').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    let w = state.naturalW, h = state.naturalH;
    if(transformState.rot % 180 !== 0) [w,h] = [h,w];
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(transformState.rot * Math.PI/180);
    ctx.scale(transformState.flipH ? -1:1, transformState.flipV ? -1:1);
    ctx.drawImage(state.img, -state.naturalW/2, -state.naturalH/2);
    ctx.restore();
    cv.toBlob(blob => {
      download(blob, baseName() + '-transform.png');
      document.getElementById('transformMeta').innerHTML = t('msg_dims_done', {w, h});
    }, 'image/png');
  });

  // ---- フィルター ----
  let currentFilter = 'none';
  document.querySelectorAll('#filterChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filterChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      currentFilter = chip.dataset.f;
      applyFilterPreview();
    });
  });
  document.getElementById('filterIntensity').addEventListener('input', e => {
    document.getElementById('filterIntVal').textContent = e.target.value;
    applyFilterPreview();
  });
  function applyFilterToCanvas(cv, filter, intensity){
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    if(filter === 'none') return;
    if(filter === 'grayscale' || filter === 'sepia'){
      const id = ctx.getImageData(0,0,w,h);
      const d = id.data;
      const amt = intensity/100;
      for(let i=0;i<d.length;i+=4){
        const r=d[i], g=d[i+1], b=d[i+2];
        if(filter === 'grayscale'){
          const gray = 0.299*r + 0.587*g + 0.114*b;
          d[i] = r + (gray-r)*amt;
          d[i+1] = g + (gray-g)*amt;
          d[i+2] = b + (gray-b)*amt;
        } else {
          const sr = 0.393*r + 0.769*g + 0.189*b;
          const sg = 0.349*r + 0.686*g + 0.168*b;
          const sb = 0.272*r + 0.534*g + 0.131*b;
          d[i] = r + (Math.min(255,sr)-r)*amt;
          d[i+1] = g + (Math.min(255,sg)-g)*amt;
          d[i+2] = b + (Math.min(255,sb)-b)*amt;
        }
      }
      ctx.putImageData(id,0,0);
    }
    if(filter === 'vignette'){
      const amt = intensity/100;
      const grad = ctx.createRadialGradient(w/2,h/2, w*0.3, w/2,h/2, Math.max(w,h)*0.7);
      grad.addColorStop(0,'rgba(0,0,0,0)');
      grad.addColorStop(1,`rgba(0,0,0,${amt*0.85})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    }
    if(filter === 'grain'){
      const amt = intensity/100;
      const id = ctx.getImageData(0,0,w,h);
      const d = id.data;
      const strength = amt*60;
      for(let i=0;i<d.length;i+=4){
        const n = (Math.random()-0.5)*strength;
        d[i] = Math.min(255,Math.max(0,d[i]+n));
        d[i+1] = Math.min(255,Math.max(0,d[i+1]+n));
        d[i+2] = Math.min(255,Math.max(0,d[i+2]+n));
      }
      ctx.putImageData(id,0,0);
    }
  }
  function applyFilterPreview(){
    const cv = document.getElementById('cv-filter');
    drawToCanvas('cv-filter');
    applyFilterToCanvas(cv, currentFilter, document.getElementById('filterIntensity').value);
  }
  document.getElementById('doFilter').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    cv.getContext('2d').drawImage(state.img,0,0);
    applyFilterToCanvas(cv, currentFilter, document.getElementById('filterIntensity').value);
    cv.toBlob(blob => {
      download(blob, baseName() + '-filter.png');
      document.getElementById('filterMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- CRTエフェクト ----
  function applyCrtToCanvas(cv, scanPct, vigPct, glowPct){
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    const scan = scanPct/100, vig = vigPct/100, glow = glowPct/100;

    // にじみ（グロー）: ぼかした自分自身を薄く重ねる
    if(glow > 0){
      const blurred = document.createElement('canvas');
      blurred.width = w; blurred.height = h;
      const bctx = blurred.getContext('2d');
      bctx.filter = `blur(${Math.max(1, Math.round(Math.min(w,h)*0.01*glow*3))}px)`;
      bctx.drawImage(cv, 0, 0);
      ctx.save();
      ctx.globalAlpha = glow*0.5;
      ctx.globalCompositeOperation = 'lighten';
      ctx.drawImage(blurred, 0, 0);
      ctx.restore();
    }

    // 走査線
    if(scan > 0){
      ctx.save();
      ctx.globalAlpha = scan*0.55;
      ctx.fillStyle = '#000';
      const step = Math.max(2, Math.round(h/240));
      for(let y=0; y<h; y+=step*2){
        ctx.fillRect(0, y, w, step);
      }
      ctx.restore();
    }

    // ヴィネット
    if(vig > 0){
      const grad = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.25, w/2,h/2, Math.max(w,h)*0.72);
      grad.addColorStop(0,'rgba(0,0,0,0)');
      grad.addColorStop(1,`rgba(0,0,0,${vig*0.75})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    }
  }
  function applyCrtPreview(){
    const cv = document.getElementById('cv-crt');
    drawToCanvas('cv-crt');
    applyCrtToCanvas(cv,
      document.getElementById('crtScanIntensity').value,
      document.getElementById('crtVigIntensity').value,
      document.getElementById('crtGlowIntensity').value);
  }
  ['crtScanIntensity','crtVigIntensity','crtGlowIntensity'].forEach(id => {
    document.getElementById(id).addEventListener('input', e => {
      const valMap = {crtScanIntensity:'crtScanVal', crtVigIntensity:'crtVigVal', crtGlowIntensity:'crtGlowVal'};
      document.getElementById(valMap[id]).textContent = e.target.value;
      applyCrtPreview();
    });
  });
  document.getElementById('doCrt').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    cv.getContext('2d').drawImage(state.img,0,0);
    applyCrtToCanvas(cv,
      document.getElementById('crtScanIntensity').value,
      document.getElementById('crtVigIntensity').value,
      document.getElementById('crtGlowIntensity').value);
    cv.toBlob(blob => {
      download(blob, baseName() + '-crt.png');
      document.getElementById('crtMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- ぼかし・モザイク ----
  let mosaicMode = 'mosaic';
  let mosaicScale = 1;
  let mosaicRect = {x:40,y:40,w:120,h:120};
  const mosaicImgEl = document.getElementById('mosaicImg');
  const mosaicBoxEl = document.getElementById('mosaicBox');
  const mosaicWrapEl = document.getElementById('mosaicOverlayWrap');

  function initMosaic(){
    mosaicImgEl.src = state.img.src;
    mosaicImgEl.onload = () => {
      const scale = Math.min(460/state.naturalW, 480/state.naturalH, 1);
      mosaicScale = scale;
      mosaicImgEl.style.width = (state.naturalW*scale)+'px';
      mosaicImgEl.style.height = (state.naturalH*scale)+'px';
      mosaicWrapEl.style.width = (state.naturalW*scale)+'px';
      mosaicWrapEl.style.height = (state.naturalH*scale)+'px';
      mosaicRect = {x:state.naturalW*scale*0.25, y:state.naturalH*scale*0.25, w:state.naturalW*scale*0.5, h:state.naturalH*scale*0.5};
      applyMosaicBox();
      updateMosaicModeUI();
      updateMosaicPreview();
    };
  }
  function applyMosaicBox(){
    mosaicBoxEl.style.left = mosaicRect.x+'px';
    mosaicBoxEl.style.top = mosaicRect.y+'px';
    mosaicBoxEl.style.width = mosaicRect.w+'px';
    mosaicBoxEl.style.height = mosaicRect.h+'px';
  }
  function updateMosaicModeUI(){
    mosaicBoxEl.style.display = mosaicMode === 'mosaic' ? 'block' : 'none';
  }
  function updateMosaicPreview(){
    if(!state.img || !mosaicScale) return;
    const prevCv = document.getElementById('cv-mosaic-preview');
    const w = Math.round(state.naturalW*mosaicScale), h = Math.round(state.naturalH*mosaicScale);
    prevCv.width = w; prevCv.height = h;
    const ctx = prevCv.getContext('2d');
    ctx.clearRect(0,0,w,h);
    const intensity = parseInt(document.getElementById('mosaicIntensity').value);
    if(mosaicMode === 'blur'){
      drawImageHQ(ctx, state.img, w, h);
      const snapshot = document.createElement('canvas');
      snapshot.width = w; snapshot.height = h;
      snapshot.getContext('2d').drawImage(prevCv, 0, 0);
      ctx.clearRect(0,0,w,h);
      ctx.filter = `blur(${Math.max(1, intensity*mosaicScale)}px)`;
      ctx.drawImage(snapshot,0,0);
      ctx.filter = 'none';
    } else {
      drawImageHQ(ctx, state.img, w, h);
      const rx = mosaicRect.x, ry = mosaicRect.y, rw = mosaicRect.w, rh = mosaicRect.h;
      const block = Math.max(2, Math.round(intensity*mosaicScale));
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(rw/block));
      tmp.height = Math.max(1, Math.round(rh/block));
      tmp.getContext('2d').drawImage(state.img, rx/mosaicScale, ry/mosaicScale, rw/mosaicScale, rh/mosaicScale, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, rx, ry, rw, rh);
    }
  }
  document.querySelectorAll('#mosaicModeChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#mosaicModeChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      mosaicMode = chip.dataset.m;
      updateMosaicModeUI();
      updateMosaicPreview();
    });
  });
  document.getElementById('mosaicIntensity').addEventListener('input', e => {
    document.getElementById('mosaicIntVal').textContent = e.target.value;
    updateMosaicPreview();
  });
  let mDragMode = null, mDragStart = null;
  mosaicBoxEl.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    mDragMode = e.target.classList.contains('handle') ? [...e.target.classList].find(c=>c!=='handle') : 'move';
    mDragStart = {x:e.clientX, y:e.clientY, rect:{...mosaicRect}};
  });
  document.addEventListener('mousemove', e => {
    if(!mDragMode) return;
    const dx = e.clientX - mDragStart.x, dy = e.clientY - mDragStart.y;
    const r = {...mDragStart.rect};
    const maxW = state.naturalW*mosaicScale, maxH = state.naturalH*mosaicScale;
    if(mDragMode === 'move'){
      r.x = Math.max(0, Math.min(maxW-r.w, r.x+dx));
      r.y = Math.max(0, Math.min(maxH-r.h, r.y+dy));
    } else {
      if(mDragMode.includes('e')) r.w = Math.max(20, Math.min(maxW-r.x, mDragStart.rect.w+dx));
      if(mDragMode.includes('s')) r.h = Math.max(20, Math.min(maxH-r.y, mDragStart.rect.h+dy));
      if(mDragMode.includes('w')){
        const newX = Math.max(0, mDragStart.rect.x+dx);
        r.w = Math.max(20, mDragStart.rect.x+mDragStart.rect.w-newX);
        r.x = newX;
      }
      if(mDragMode.includes('n')){
        const newY = Math.max(0, mDragStart.rect.y+dy);
        r.h = Math.max(20, mDragStart.rect.y+mDragStart.rect.h-newY);
        r.y = newY;
      }
    }
    mosaicRect = r;
    applyMosaicBox();
    updateMosaicPreview();
  });
  document.addEventListener('mouseup', () => {
    if(mDragMode){ mDragMode = null; }
  });

  document.getElementById('doMosaic').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    const ctx = cv.getContext('2d');
    ctx.drawImage(state.img,0,0);
    const intensity = parseInt(document.getElementById('mosaicIntensity').value);
    if(mosaicMode === 'blur'){
      ctx.filter = `blur(${intensity}px)`;
      ctx.drawImage(state.img,0,0);
      ctx.filter = 'none';
    } else {
      const sx = mosaicRect.x/mosaicScale, sy = mosaicRect.y/mosaicScale;
      const sw = mosaicRect.w/mosaicScale, sh = mosaicRect.h/mosaicScale;
      const block = Math.max(4, intensity);
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(sw/block));
      tmp.height = Math.max(1, Math.round(sh/block));
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(state.img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, sx, sy, sw, sh);
    }
    cv.toBlob(blob => {
      download(blob, baseName() + '-mosaic.png');
      document.getElementById('mosaicMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- 角丸 ----
  function applyRoundPreview(){
    const cv = document.getElementById('cv-round');
    drawToCanvas('cv-round');
    const ctx = cv.getContext('2d');
    const bufMult = cv.width / parseFloat(cv.style.width);
    const r = Math.min(document.getElementById('roundRadius').value * bufMult, cv.width/2, cv.height/2);
    const id = ctx.getImageData(0,0,cv.width,cv.height);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.putImageData(id,0,0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    roundedRectPath(ctx, 0,0,cv.width,cv.height,r);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  function roundedRectPath(ctx,x,y,w,h,r){
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  document.getElementById('roundRadius').addEventListener('input', e => {
    document.getElementById('roundVal').textContent = e.target.value;
    applyRoundPreview();
  });
  document.getElementById('doRound').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    const ctx = cv.getContext('2d');
    ctx.drawImage(state.img,0,0);
    const previewCv = document.getElementById('cv-round');
    const previewCssW = parseFloat(previewCv.style.width) || previewCv.width;
    const r = Math.min(document.getElementById('roundRadius').value * (state.naturalW/previewCssW), cv.width/2, cv.height/2);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    roundedRectPath(ctx,0,0,cv.width,cv.height,r);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    cv.toBlob(blob => {
      download(blob, baseName() + '-round.png');
      document.getElementById('roundMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- 明暗調整 ----
  function applyBrightnessPreview(){
    const cv = document.getElementById('cv-brightness');
    const cssScale = Math.min(460/state.naturalW, 480/state.naturalH, 1);
    const cssW = Math.round(state.naturalW*cssScale), cssH = Math.round(state.naturalH*cssScale);
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    const qualityMult = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    cv.width = Math.round(cssW*qualityMult);
    cv.height = Math.round(cssH*qualityMult);
    const tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    drawImageHQ(tmp.getContext('2d'), state.img, cv.width, cv.height);
    const ctx = cv.getContext('2d');
    const val = parseInt(document.getElementById('brightRange').value);
    ctx.filter = `brightness(${100+val}%)`;
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
  }
  document.getElementById('brightRange').addEventListener('input', e => {
    document.getElementById('brightVal').textContent = e.target.value;
    applyBrightnessPreview();
  });
  document.getElementById('doBrightness').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    const ctx = cv.getContext('2d');
    const val = parseInt(document.getElementById('brightRange').value);
    ctx.filter = `brightness(${100+val}%)`;
    ctx.drawImage(state.img, 0, 0);
    cv.toBlob(blob => {
      download(blob, baseName() + '-brightness.png');
      document.getElementById('brightnessMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- テキスト追加 ----
  let textBold = false, textItalic = false, textEffect = 'none';
  let lastTextBounds = null;
  document.getElementById('textBoldChip').addEventListener('click', function(){
    textBold = !textBold;
    this.classList.toggle('on', textBold);
    applyTextPreview();
  });
  document.getElementById('textItalicChip').addEventListener('click', function(){
    textItalic = !textItalic;
    this.classList.toggle('on', textItalic);
    applyTextPreview();
  });
  document.querySelectorAll('#textEffectChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#textEffectChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      textEffect = chip.dataset.e;
      applyTextPreview();
    });
  });

  function drawTextOnCanvas(ctx, w, h){
    const text = document.getElementById('textContent').value;
    if(!text) return null;
    const size = parseInt(document.getElementById('textSize').value) || 48;
    const color = document.getElementById('textColor').value;
    const outlineColor = document.getElementById('textOutlineColor').value;
    const fontFamily = document.getElementById('textFont').value;
    const xPct = parseInt(document.getElementById('textX').value) / 100;
    const yPct = parseInt(document.getElementById('textY').value) / 100;
    const scale = w / state.naturalW;
    const px = Math.max(1, Math.round(size*scale));
    let fontStr = '';
    if(textItalic) fontStr += 'italic ';
    if(textBold) fontStr += 'bold ';
    fontStr += `${px}px ${fontFamily}`;
    ctx.font = fontStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = w*xPct, y = h*yPct;

    if(textEffect === 'shadow'){
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = px*0.15;
      ctx.shadowOffsetX = px*0.07;
      ctx.shadowOffsetY = px*0.07;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    } else if(textEffect === 'outline'){
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = Math.max(1, px*0.12);
      ctx.strokeStyle = outlineColor;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    } else {
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
    const metrics = ctx.measureText(text);
    return { x, y, width: metrics.width, height: px };
  }
  function applyTextPreview(){
    const cv = document.getElementById('cv-text');
    drawToCanvas('cv-text');
    const ctx = cv.getContext('2d');
    lastTextBounds = drawTextOnCanvas(ctx, cv.width, cv.height);
  }
  ['textContent','textSize','textColor','textOutlineColor','textFont','textX','textY'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyTextPreview);
  });

  // プレビュー上でテキストをドラッグして移動
  let textDragging = false;
  const cvTextEl = document.getElementById('cv-text');
  cvTextEl.addEventListener('mousedown', e => {
    if(!lastTextBounds) return;
    const rect = cvTextEl.getBoundingClientRect();
    const scaleX = cvTextEl.width/rect.width, scaleY = cvTextEl.height/rect.height;
    const mx = (e.clientX-rect.left)*scaleX, my = (e.clientY-rect.top)*scaleY;
    const {x, y, width, height} = lastTextBounds;
    if(Math.abs(mx-x) < width/2+12 && Math.abs(my-y) < height/2+12){
      textDragging = true;
      cvTextEl.style.cursor = 'grabbing';
    }
  });
  document.addEventListener('mousemove', e => {
    if(!textDragging) return;
    const rect = cvTextEl.getBoundingClientRect();
    const scaleX = cvTextEl.width/rect.width, scaleY = cvTextEl.height/rect.height;
    const mx = (e.clientX-rect.left)*scaleX, my = (e.clientY-rect.top)*scaleY;
    const xPct = Math.max(0, Math.min(100, Math.round((mx/cvTextEl.width)*100)));
    const yPct = Math.max(0, Math.min(100, Math.round((my/cvTextEl.height)*100)));
    document.getElementById('textX').value = xPct;
    document.getElementById('textY').value = yPct;
    applyTextPreview();
  });
  document.addEventListener('mouseup', () => {
    if(textDragging){ textDragging = false; cvTextEl.style.cursor = 'grab'; }
  });

  document.getElementById('clearText').addEventListener('click', () => {
    document.getElementById('textContent').value = '';
    document.getElementById('textX').value = 50;
    document.getElementById('textY').value = 50;
    textBold = false; textItalic = false; textEffect = 'none';
    document.getElementById('textBoldChip').classList.remove('on');
    document.getElementById('textItalicChip').classList.remove('on');
    document.querySelectorAll('#textEffectChips .chip').forEach(c => c.classList.remove('on'));
    document.querySelector('#textEffectChips .chip[data-e="none"]').classList.add('on');
    applyTextPreview();
  });

  document.getElementById('doText').addEventListener('click', () => {
    const cv = document.createElement('canvas');
    cv.width = state.naturalW; cv.height = state.naturalH;
    const ctx = cv.getContext('2d');
    ctx.drawImage(state.img, 0, 0);
    drawTextOnCanvas(ctx, cv.width, cv.height);
    cv.toBlob(blob => {
      download(blob, baseName() + '-text.png');
      document.getElementById('textMeta').innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- Base64変換 ----
  document.getElementById('doBase64').addEventListener('click', () => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      document.getElementById('base64Output').value = dataUrl;
      document.getElementById('base64Meta').innerHTML = t('msg_base64_done', {size: fmtBytes(dataUrl.length)});
    };
    reader.readAsDataURL(state.file);
  });
  document.getElementById('copyBase64').addEventListener('click', () => {
    const ta = document.getElementById('base64Output');
    if(!ta.value) return;
    navigator.clipboard.writeText(ta.value).then(() => {
      document.getElementById('base64Meta').textContent = t('msg_copied');
    }).catch(() => {
      ta.select();
      document.execCommand('copy');
    });
  });

  // ---- 画像結合 ----
  let stitchImages = [];
  const stitchAddEl = document.getElementById('stitchAdd');
  function addStitchFiles(fileList){
    [...fileList].forEach(f => {
      if(!f.type.startsWith('image/')) return;
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => { stitchImages.push(img); renderStitchThumbs(); drawStitchPreview(); };
      img.src = url;
    });
  }
  stitchAddEl.addEventListener('click', () => document.getElementById('stitchInput').click());
  stitchAddEl.addEventListener('dragover', e => { e.preventDefault(); stitchAddEl.classList.add('drag'); });
  stitchAddEl.addEventListener('dragleave', () => stitchAddEl.classList.remove('drag'));
  stitchAddEl.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation(); stitchAddEl.classList.remove('drag');
    addStitchFiles(e.dataTransfer.files);
  });
  document.getElementById('stitchInput').addEventListener('change', e => {
    addStitchFiles(e.target.files);
    e.target.value = '';
  });
  function renderStitchThumbs(){
    const wrap = document.getElementById('stitchThumbs');
    wrap.innerHTML = '';
    stitchImages.forEach((img, i) => {
      const th = document.createElement('div');
      th.className = 'th';
      th.innerHTML = `<img src="${img.src}"><button data-i="${i}">×</button>`;
      th.querySelector('button').addEventListener('click', () => {
        stitchImages.splice(i,1);
        renderStitchThumbs();
        drawStitchPreview();
      });
      wrap.appendChild(th);
    });
  }
  let stitchDir = 'h';
  document.querySelectorAll('#stitchDirChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#stitchDirChips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      stitchDir = chip.dataset.d;
      drawStitchPreview();
    });
  });
  document.getElementById('stitchGap').addEventListener('input', e => {
    document.getElementById('stitchGapVal').textContent = e.target.value;
    drawStitchPreview();
  });
  function buildStitchCanvas(){
    if(stitchImages.length === 0) return null;
    const gap = parseInt(document.getElementById('stitchGap').value);
    const cv = document.createElement('canvas');
    if(stitchDir === 'h'){
      const targetH = Math.min(...stitchImages.map(i=>i.naturalHeight));
      let totalW = 0;
      const widths = stitchImages.map(img => {
        const w = Math.round(img.naturalWidth * (targetH/img.naturalHeight));
        totalW += w;
        return w;
      });
      totalW += gap*(stitchImages.length-1);
      cv.width = totalW; cv.height = targetH;
      const ctx = cv.getContext('2d');
      let x = 0;
      stitchImages.forEach((img,i) => {
        drawImageHQ(ctx, img, widths[i], targetH, x, 0);
        x += widths[i] + gap;
      });
    } else {
      const targetW = Math.min(...stitchImages.map(i=>i.naturalWidth));
      let totalH = 0;
      const heights = stitchImages.map(img => {
        const h = Math.round(img.naturalHeight * (targetW/img.naturalWidth));
        totalH += h;
        return h;
      });
      totalH += gap*(stitchImages.length-1);
      cv.width = targetW; cv.height = totalH;
      const ctx = cv.getContext('2d');
      let y = 0;
      stitchImages.forEach((img,i) => {
        drawImageHQ(ctx, img, targetW, heights[i], 0, y);
        y += heights[i] + gap;
      });
    }
    return cv;
  }
  function drawStitchPreview(){
    const full = buildStitchCanvas();
    const cv = document.getElementById('cv-stitch');
    const ctx = cv.getContext('2d');
    if(!full){ cv.width=1; cv.height=1; ctx.clearRect(0,0,1,1); return; }
    const scale = Math.min(460/full.width, 480/full.height, 1);
    cv.width = Math.round(full.width*scale);
    cv.height = Math.round(full.height*scale);
    drawImageHQ(ctx, full, cv.width, cv.height);
  }
  document.getElementById('doStitch').addEventListener('click', () => {
    const full = buildStitchCanvas();
    if(!full){ document.getElementById('stitchMeta').textContent = t('msg_stitch_need_images'); return; }
    full.toBlob(blob => {
      download(blob, 'stitched.png');
      document.getElementById('stitchMeta').innerHTML = t('msg_dims_size_done', {w: full.width, h: full.height, size: fmtBytes(blob.size)});
    }, 'image/png');
  });

  // ---- グリッド分割 ----
  let gridColFracs = [], gridRowFracs = [];
  function ensureGridFracs(){
    const cols = parseInt(document.getElementById('gridCols').value)||1;
    const rows = parseInt(document.getElementById('gridRows').value)||1;
    gridColFracs = Array.from({length: Math.max(0,cols-1)}, (_,i)=>(i+1)/cols);
    gridRowFracs = Array.from({length: Math.max(0,rows-1)}, (_,i)=>(i+1)/rows);
  }
  // 画像とグリッド線を同じcanvasに描く（drawToCanvasで描いた画像の上に線を重ねて描画）
  function drawGridLines(){
    const cv = document.getElementById('cv-grid');
    if(!state.img) return;
    drawToCanvas('cv-grid');
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = '#29e0c4';
    ctx.lineWidth = 2;
    gridColFracs.forEach(fx => {
      const x = cv.width*fx;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cv.height); ctx.stroke();
    });
    gridRowFracs.forEach(fy => {
      const y = cv.height*fy;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cv.width,y); ctx.stroke();
    });
  }
  document.getElementById('gridCols').addEventListener('input', () => { ensureGridFracs(); drawGridLines(); });
  document.getElementById('gridRows').addEventListener('input', () => { ensureGridFracs(); drawGridLines(); });

  // 線をマウスでドラッグして位置調整
  const gridCv = document.getElementById('cv-grid');
  const GRID_HIT = 10;
  let gridDrag = null; // {axis:'col'|'row', idx}
  function gridCanvasPos(e){
    const rect = gridCv.getBoundingClientRect();
    const scaleX = gridCv.width / rect.width, scaleY = gridCv.height / rect.height;
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY };
  }
  gridCv.addEventListener('mousedown', e => {
    if(!state.img) return;
    const pos = gridCanvasPos(e);
    for(let i=0;i<gridColFracs.length;i++){
      if(Math.abs(pos.x - gridColFracs[i]*gridCv.width) < GRID_HIT){ gridDrag = {axis:'col', idx:i}; e.preventDefault(); return; }
    }
    for(let i=0;i<gridRowFracs.length;i++){
      if(Math.abs(pos.y - gridRowFracs[i]*gridCv.height) < GRID_HIT){ gridDrag = {axis:'row', idx:i}; e.preventDefault(); return; }
    }
  });
  document.addEventListener('mousemove', e => {
    if(!gridDrag) return;
    const pos = gridCanvasPos(e);
    const MARGIN = 0.03;
    if(gridDrag.axis === 'col'){
      const arr = gridColFracs;
      const lo = gridDrag.idx === 0 ? MARGIN : arr[gridDrag.idx-1]+MARGIN;
      const hi = gridDrag.idx === arr.length-1 ? 1-MARGIN : arr[gridDrag.idx+1]-MARGIN;
      arr[gridDrag.idx] = Math.max(lo, Math.min(hi, pos.x/gridCv.width));
    } else {
      const arr = gridRowFracs;
      const lo = gridDrag.idx === 0 ? MARGIN : arr[gridDrag.idx-1]+MARGIN;
      const hi = gridDrag.idx === arr.length-1 ? 1-MARGIN : arr[gridDrag.idx+1]-MARGIN;
      arr[gridDrag.idx] = Math.max(lo, Math.min(hi, pos.y/gridCv.height));
    }
    drawGridLines();
  });
  document.addEventListener('mouseup', () => { gridDrag = null; });
  gridCv.addEventListener('mousemove', e => {
    if(!state.img) return;
    if(gridDrag) { gridCv.style.cursor = gridDrag.axis === 'col' ? 'col-resize' : 'row-resize'; return; }
    const pos = gridCanvasPos(e);
    const onCol = gridColFracs.some(fx => Math.abs(pos.x - fx*gridCv.width) < GRID_HIT);
    const onRow = gridRowFracs.some(fy => Math.abs(pos.y - fy*gridCv.height) < GRID_HIT);
    gridCv.style.cursor = onCol ? 'col-resize' : (onRow ? 'row-resize' : 'default');
  });

  document.getElementById('doGrid').addEventListener('click', () => {
    const colBounds = [0, ...gridColFracs, 1].map(f => f*state.naturalW);
    const rowBounds = [0, ...gridRowFracs, 1].map(f => f*state.naturalH);
    let count = 0;
    for(let r=0;r<rowBounds.length-1;r++){
      for(let c=0;c<colBounds.length-1;c++){
        const x0 = colBounds[c], x1 = colBounds[c+1];
        const y0 = rowBounds[r], y1 = rowBounds[r+1];
        const cv = document.createElement('canvas');
        cv.width = Math.round(x1-x0); cv.height = Math.round(y1-y0);
        cv.getContext('2d').drawImage(state.img, x0, y0, x1-x0, y1-y0, 0, 0, cv.width, cv.height);
        ((cvv, idx) => {
          setTimeout(() => {
            cvv.toBlob(blob => download(blob, baseName() + `-tile${idx+1}.png`), 'image/png');
          }, idx*250);
        })(cv, count);
        count++;
      }
    }
    document.getElementById('gridMeta').innerHTML = t('msg_grid_done', {cols: colBounds.length-1, rows: rowBounds.length-1, count});
  });

  // ---- 背景除去 (AI / クライアントサイド推論) ----
  // モデル本体はボタンを押すまでダウンロードしない（遅延読み込み）
  let imglyPromise = null;
  function getImgly(){
    if(!imglyPromise){
      imglyPromise = import('https://esm.sh/@imgly/background-removal@1.5.8');
    }
    return imglyPromise;
  }
  document.getElementById('doBgRemove').addEventListener('click', async () => {
    const btn = document.getElementById('doBgRemove');
    const meta = document.getElementById('bgremoveMeta');
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = t('label_processing');
    meta.textContent = t('msg_ai_loading');
    try{
      const mod = await getImgly();
      const removeBackground = mod.removeBackground || mod.default;
      const blob = await removeBackground(state.file, {
        progress: (key, current, total) => {
          meta.textContent = t('msg_ai_progress', {current, total});
        }
      });
      const url = URL.createObjectURL(blob);
      const previewImg = new Image();
      previewImg.onload = () => {
        const cv = document.getElementById('cv-bgremove');
        const scale = Math.min(460/previewImg.naturalWidth, 480/previewImg.naturalHeight, 1);
        cv.width = Math.round(previewImg.naturalWidth*scale);
        cv.height = Math.round(previewImg.naturalHeight*scale);
        const ctx = cv.getContext('2d');
        ctx.clearRect(0,0,cv.width,cv.height);
        ctx.drawImage(previewImg,0,0,cv.width,cv.height);
      };
      previewImg.src = url;
      download(blob, baseName() + '-nobg.png');
      meta.innerHTML = t('msg_size_done', {size: fmtBytes(blob.size)});
    } catch(e){
      meta.textContent = t('msg_fail_online', {err: e.message});
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });

})();
