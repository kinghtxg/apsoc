/**
 * APSTARVUL · 全球攻击流可视化（Cybermap 风格 · 大陆粒子版）
 * 纯 Canvas 实现：
 *  - 3D 旋转粒子地球：真实陆地掩码（land.js）驱动，陆地为亮绿粒子、海洋为暗点
 *  - 攻击弧线贴球飞行：城市锚点起降、微抬升、背面减淡、彗尾拖曳 + 命中冲击波
 *  - 陆地活动光点：随机大陆位置的脉冲闪烁（表达「陆地上的攻击活动」）
 * 数据为程序生成的示意流，仅作视觉呈现。
 */
(function () {
  var canvas = document.getElementById('globe');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, CY, CX, dpr = Math.min(window.devicePixelRatio || 1, 2);

  // 世界主要城市坐标（经度/纬度，全部位于陆地，作为攻击源/目标锚点）
  var CITIES = [
    ['北京', 116.4, 39.9], ['上海', 121.5, 31.2], ['深圳', 114.1, 22.5],
    ['东京', 139.7, 35.7], ['首尔', 127.0, 37.6], ['新加坡', 103.8, 1.35],
    ['悉尼', 151.2, -33.9], ['莫斯科', 37.6, 55.8], ['伦敦', -0.1, 51.5],
    ['法兰克福', 8.7, 50.1], ['纽约', -74.0, 40.7], ['洛杉矶', -118.2, 34.1],
    ['旧金山', -122.4, 37.8], ['圣保罗', -46.6, -23.5], ['孟买', 72.9, 19.1],
    ['迪拜', 55.3, 25.3], ['阿姆斯特丹', 4.9, 52.4], ['多伦多', -79.4, 43.7],
    ['墨西哥城', -99.1, 19.4], ['约翰内斯堡', 28.0, -26.2]
  ];

  var R = 0;          // 球体半径（每帧重算）
  var rot = 0;        // 自转角度
  var arcs = [];      // 活跃攻击弧线
  var flashes = [];   // 命中冲击波
  var sparks = [];    // 陆地活动光点
  var points = [];    // 粒子点阵（球面均匀分布 + 陆地标记）
  var landIdx = [];   // 陆地粒子索引（用于随机活动光点采样）
  var starField = []; // 背景星点
  var meteors = [];   // 流星

  var MAX_ARCS = 46;      // 并发弧线上限
  var SPAWN_P = 0.16;     // 每帧生成概率
  var RED_P = 0.34;       // 红色攻击弧占比
  var MAX_OMEGA = 1.9;    // 弧线最大角距（约 109°），避免超长弧脱离球面观感

  /* ============ 陆地掩码（data/land.js 提供，仅陆/海二值，无国界表达） ============ */
  var LAND = null;
  (function () {
    var m = window.APSV_LAND_MASK;
    if (!m || !m.data) return;
    var raw = atob(m.data), bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    LAND = { w: m.w, h: m.h, bytes: bytes };
  })();

  function isLand(lon, lat) {
    if (!LAND) return true; // 掩码缺失时兜底为全陆地
    var ci = Math.floor((lon + 180) / 360 * LAND.w);
    var ri = Math.floor((90 - lat) / 180 * LAND.h);
    if (ci < 0) ci = 0; else if (ci >= LAND.w) ci = LAND.w - 1;
    if (ri < 0) ri = 0; else if (ri >= LAND.h) ri = LAND.h - 1;
    var idx = ri * LAND.w + ci;
    return (LAND.bytes[idx >> 3] >> (7 - (idx & 7))) & 1;
  }

  // 生成球面点阵（Fibonacci 球面均匀分布 + 陆地标记）
  function buildSphere(n) {
    var pts = [];
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / (n - 1)) * 2;
      var rad = Math.sqrt(1 - y * y);
      var th = ga * i;
      var x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      var lat = Math.asin(y) * 180 / Math.PI;
      var lon = Math.atan2(z, x) * 180 / Math.PI;
      var land = isLand(lon, lat);
      if (land) landIdx.push(i);
      pts.push({ x: x, y: y, z: z, land: land });
    }
    return pts;
  }

  function buildStars() {
    starField = [];
    for (var i = 0; i < 560; i++) {
      starField.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.6 + 0.45,
        a: Math.random() * 0.5 + 0.55, // 星空整体微微提亮
        tw: Math.random() * 0.02 + 0.005
      });
    }
  }

  // 生成一颗流星：随机方向斜向划过，带渐隐拖尾
  function spawnMeteor() {
    var dir = Math.random() < 0.5 ? -1 : 1; // -1 向左下，1 向右下
    meteors.push({
      x: W * Math.random(),
      y: H * Math.random() * 0.85,
      vx: dir * (4 + Math.random() * 4),
      vy: 2.2 + Math.random() * 1.8,
      len: 90 + Math.random() * 130,
      life: 1,
      decay: 0.01 + Math.random() * 0.008
    });
  }

  // 经纬度 → 3D 单位向量
  function ll2vec(lon, lat) {
    var l = lon * Math.PI / 180, p = lat * Math.PI / 180;
    return { x: Math.cos(p) * Math.cos(l), y: Math.sin(p), z: Math.cos(p) * Math.sin(l) };
  }

  // 球面 slerp + 微抬升（贴球飞行）→ 返回抬升后的 3D 点
  function arcPoint(from, to, t, omega, so) {
    var w1 = Math.sin((1 - t) * omega) / so;
    var w2 = Math.sin(t * omega) / so;
    var mx = from.x * w1 + to.x * w2;
    var my = from.y * w1 + to.y * w2;
    var mz = from.z * w1 + to.z * w2;
    var ml = Math.sqrt(mx * mx + my * my + mz * mz);
    mx /= ml; my /= ml; mz /= ml;
    var lift = Math.sin(t * Math.PI) * 0.075;
    return { x: mx * (1 + lift), y: my * (1 + lift), z: mz * (1 + lift) };
  }

  // 生成一条攻击弧线（城市锚点均在陆地，角距受限）
  function spawnArc() {
    var a = CITIES[(Math.random() * CITIES.length) | 0];
    var b = CITIES[(Math.random() * CITIES.length) | 0];
    if (a === b) return;
    var va = ll2vec(a[1], a[2]), vb = ll2vec(b[1], b[2]);
    var dot = Math.max(-1, Math.min(1, va.x * vb.x + va.y * vb.y + va.z * vb.z));
    var omega = Math.acos(dot);
    if (omega > MAX_OMEGA) return; // 超长弧直接放弃，保持贴球观感
    var red = Math.random() < RED_P; // 红=高危攻击，绿=正常监测
    arcs.push({
      from: va, to: vb, fa: a[0], ta: b[0],
      t: 0, speed: 0.9 + Math.random() * 1.3,
      hue: red ? 8 : 145,
      lw: red ? 1.7 : 1.1,
      omega: omega, so: Math.sin(omega) || 1e-4,
      life: 1, hit: false
    });
  }

  function spawnFlash(vec, hue) {
    flashes.push({ v: vec, hue: hue, p: 0 });
  }

  // 陆地活动光点：随机大陆位置脉冲闪烁
  function spawnSpark() {
    if (!landIdx.length) return;
    var p = points[landIdx[(Math.random() * landIdx.length) | 0]];
    sparks.push({ v: { x: p.x, y: p.y, z: p.z }, life: 1, decay: 0.016 + Math.random() * 0.02, hue: Math.random() < 0.3 ? 8 : 145 });
  }

  function project(v) {
    // 绕 Y 轴自转
    var c = Math.cos(rot), s = Math.sin(rot);
    var x = v.x * c - v.z * s;
    var z = v.x * s + v.z * c;
    var y = v.y;
    // 透视投影（球心偏下：星球从地平线升起的构图）
    var persp = 1.6;
    var scale = persp / (persp + z);
    return { x: CX + x * R * scale, y: CY + y * R * scale, z: z, s: scale };
  }

  // 绘制大圆弧：正面/背面分离描边 + 彗尾拖曳 + 高亮头部（均贴球）
  function drawArc(a) {
    var N = 36;
    var head = Math.min(a.t, 1);

    // —— 全程弧线：前/后两段分开描（背面极淡，形成被球体遮挡的观感）——
    // 断点处重新起笔（moveTo），避免分裂段被连成穿越球面的直线弦
    var proj = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var pp = project(arcPoint(a.from, a.to, t, a.omega, a.so));
      proj.push({ x: pp.x, y: pp.y, front: pp.z > -0.08 });
    }
    ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      var want = pass === 0 ? false : true; // 先画背面，再画正面
      ctx.beginPath();
      var drawing = false;
      for (var q = 0; q <= N; q++) {
        if (proj[q].front === want) {
          if (!drawing) { ctx.moveTo(proj[q].x, proj[q].y); drawing = true; }
          else ctx.lineTo(proj[q].x, proj[q].y);
        } else drawing = false;
      }
      if (drawing) {
        if (want) {
          ctx.strokeStyle = 'hsla(' + a.hue + ',90%,60%,' + (0.24 * a.life).toFixed(3) + ')';
          ctx.lineWidth = a.lw * 0.8;
        } else {
          ctx.strokeStyle = 'hsla(' + a.hue + ',90%,55%,' + (0.06 * a.life).toFixed(3) + ')';
          ctx.lineWidth = a.lw * 0.7;
        }
        ctx.stroke();
      }
    }

    // —— 彗尾拖曳段 + 头部（仅当头部位于球体正面时绘制）——
    var hp = project(arcPoint(a.from, a.to, head, a.omega, a.so));
    if (hp.z > -0.05) {
      var t0 = Math.max(0, head - 0.22);
      var N2 = 12;
      ctx.beginPath();
      for (var j = 0; j <= N2; j++) {
        var t2 = t0 + (head - t0) * (j / N2);
        var p2 = project(arcPoint(a.from, a.to, t2, a.omega, a.so));
        if (j === 0) ctx.moveTo(p2.x, p2.y); else ctx.lineTo(p2.x, p2.y);
      }
      ctx.strokeStyle = 'hsla(' + a.hue + ',100%,62%,' + (0.20 * a.life).toFixed(3) + ')';
      ctx.lineWidth = a.lw * 2.8;
      ctx.stroke();
      ctx.strokeStyle = 'hsla(' + a.hue + ',100%,72%,' + (0.7 * a.life).toFixed(3) + ')';
      ctx.lineWidth = a.lw;
      ctx.stroke();

      // 头部光点（光晕 + 白热核心）
      var glow = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 7);
      glow.addColorStop(0, 'hsla(' + a.hue + ',100%,78%,' + (0.9 * a.life).toFixed(3) + ')');
      glow.addColorStop(0.4, 'hsla(' + a.hue + ',100%,60%,' + (0.45 * a.life).toFixed(3) + ')');
      glow.addColorStop(1, 'hsla(' + a.hue + ',100%,60%,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'hsla(' + a.hue + ',100%,90%,' + (0.95 * a.life).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    R = Math.min(W, H) * 0.56;
    CY = H * 0.5; CX = W / 2 + R; // 左缘对齐屏幕中线
    rot += 0.002;

    // 背景星点
    for (var si = 0; si < starField.length; si++) {
      var st = starField[si];
      var tw = 0.5 + 0.5 * Math.sin(now * st.tw * 6);
      ctx.fillStyle = 'rgba(175,205,235,' + (st.a * tw).toFixed(3) + ')';
      ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
    }

    // 流星：低频生成，划过后渐隐消失
    if (Math.random() < 0.03 && meteors.length < 7) spawnMeteor();
    for (var mi = meteors.length - 1; mi >= 0; mi--) {
      var mt = meteors[mi];
      mt.x += mt.vx; mt.y += mt.vy; mt.life -= mt.decay;
      if (mt.life <= 0 || mt.x < -mt.len || mt.x > W + mt.len || mt.y > H + mt.len) {
        meteors.splice(mi, 1);
        continue;
      }
      var lx = mt.x - mt.vx * (mt.len / 6), ly = mt.y - mt.vy * (mt.len / 6);
      var grad = ctx.createLinearGradient(mt.x, mt.y, lx, ly);
      grad.addColorStop(0, 'rgba(200,225,255,' + (0.85 * mt.life).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(200,225,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mt.x, mt.y);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235,244,255,' + (0.95 * mt.life).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(mt.x, mt.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 球体内部微光（极淡，避免「发光球体」感，让粒子定义形状）
    var ball = ctx.createRadialGradient(CX, CY, R * 0.1, CX, CY, R);
    ball.addColorStop(0, 'rgba(34,214,107,.05)');
    ball.addColorStop(0.75, 'rgba(16,30,24,.30)');
    ball.addColorStop(1, 'rgba(10,14,12,.0)');
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.fill();

    // 球体边缘轮廓光（rim light）
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34,214,107,.30)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CX, CY, R + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34,214,107,.08)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 大气光晕（外侧，极淡）
    var halo = ctx.createRadialGradient(CX, CY, R * 0.92, CX, CY, R * 1.35);
    halo.addColorStop(0, 'rgba(34,214,107,.05)');
    halo.addColorStop(1, 'rgba(34,214,107,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // 粒子点阵：陆地=亮绿粒子（大陆形状），海洋=极暗点（球体体积感）
    for (var pi = 0; pi < points.length; pi++) {
      var p = project(points[pi]);
      if (p.z > 0.15) { // 正面
        if (points[pi].land) {
          var alpha = Math.min(0.9, (p.z - 0.1) * 1.1);
          if (alpha > 0.04) {
            var sz = p.z > 0.6 ? 2.4 : 1.7;
            ctx.fillStyle = 'rgba(120,235,170,' + alpha.toFixed(3) + ')';
            ctx.fillRect(p.x, p.y, sz, sz);
          }
        } else {
          var oa = Math.min(0.16, (p.z - 0.1) * 0.22);
          if (oa > 0.02) {
            ctx.fillStyle = 'rgba(80,130,108,' + oa.toFixed(3) + ')';
            ctx.fillRect(p.x, p.y, 1, 1);
          }
        }
      }
    }

    // 陆地活动光点（大陆上的脉冲闪烁）
    if (sparks.length < 30 && Math.random() < 0.12) spawnSpark();
    for (var ki = sparks.length - 1; ki >= 0; ki--) {
      var sk = sparks[ki];
      sk.life -= sk.decay;
      if (sk.life <= 0) { sparks.splice(ki, 1); continue; }
      var kp = project(sk.v);
      if (kp.z < 0.1) continue; // 背面不画
      var ka = sk.life * 0.75;
      var kg = ctx.createRadialGradient(kp.x, kp.y, 0, kp.x, kp.y, 5);
      kg.addColorStop(0, 'hsla(' + sk.hue + ',100%,75%,' + ka.toFixed(3) + ')');
      kg.addColorStop(1, 'hsla(' + sk.hue + ',100%,60%,0)');
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'hsla(' + sk.hue + ',100%,85%,' + (ka * 1.2 > 1 ? 1 : ka * 1.2).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 绘制活跃弧线 + 命中检测
    for (var ai = arcs.length - 1; ai >= 0; ai--) {
      var a = arcs[ai];
      a.t += a.speed * 0.016;
      if (a.t >= 1 && !a.hit) {
        a.hit = true;
        spawnFlash(a.to, a.hue); // 抵达瞬间在目标城市炸开冲击波
      }
      if (a.t >= 1) a.life -= 0.05;
      if (a.life <= 0) { arcs.splice(ai, 1); continue; }
      drawArc(a);
    }

    // 命中冲击波（目标城市扩散环）
    for (var fi2 = flashes.length - 1; fi2 >= 0; fi2--) {
      var f = flashes[fi2];
      f.p += 0.035;
      if (f.p >= 1) { flashes.splice(fi2, 1); continue; }
      var fp = project(f.v);
      if (fp.z < 0.1) continue;
      var fr2 = 3 + f.p * 14;
      ctx.strokeStyle = 'hsla(' + f.hue + ',100%,70%,' + (0.5 * (1 - f.p)).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, fr2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'hsla(' + f.hue + ',100%,75%,' + (0.45 * (1 - f.p)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 2.2 * (1 - f.p) + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 城市脉冲点（源/目标，均在陆地）
    for (var ci = 0; ci < CITIES.length; ci++) {
      var v = ll2vec(CITIES[ci][1], CITIES[ci][2]);
      var cp = project(v);
      if (cp.z > 0.3) {
        var pa = 0.5 + 0.5 * Math.sin(now * 0.004 + ci);
        ctx.fillStyle = 'rgba(34,214,107,' + (0.4 + pa * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 2 + pa * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(34,214,107,' + (0.12 * pa).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 6 + pa * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 控制弧线数量（保持高密度攻击流）
    if (arcs.length < MAX_ARCS && Math.random() < SPAWN_P) spawnArc();

    requestAnimationFrame(frame);
  }

  function resize() {
    // 逻辑尺寸用 CSS 像素（W/H 供绘制坐标系使用），
    // canvas 物理分辨率乘 dpr 保证高分屏清晰；setTransform 负责两者映射。
    // 修复：此前 W/H 直接取物理像素，dpr>1 的高分屏上球心 (W/2, H*0.62)
    // 会被映射到视口外右下方，地球整体"跑偏"到右下角。
    var cw = canvas.clientWidth || 0, ch = canvas.clientHeight || 0;
    if (cw < 2) cw = window.innerWidth || 2;
    if (ch < 2) ch = window.innerHeight || 2;
    W = cw; H = ch;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    points = buildSphere(3600);
    buildStars();
    for (var i = 0; i < 26; i++) spawnArc();
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  }

  init();
})();
