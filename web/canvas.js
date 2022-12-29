(function() {

    const vars = {
        zero: { x: 0, y: 0, z: 0 },
        anchor: 0,
        canvas: undefined,
        running: undefined
    };

    const { PerspectiveCamera, WebGLRenderer, WebGL1Renderer, Scene, Group, Color } = THREE;
    const { AmbientLight, Mesh, BoxGeometry, MeshMatcapMaterial, DoubleSide, Vector2 } = THREE;
    const { BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial } = THREE;
    const { platform, vendor } = navigator;

    const SCENE = new Scene();
    const WORLD = new Group();
    const PI2 = Math.PI / 2;
    const DEG2RAD = Math.PI / 180;
    const origin2d = new Vector2(0, 0);
    const matcap = new MeshMatcapMaterial({
        flatShading: true,
        color: 0xeeeeee,
        side: DoubleSide
    });

    function width() {
        return vars.canvas.clientWidth;
    }

    function height() {
        return vars.canvas.clientHeight;
    }

    function aspect() {
        return width() / height();
    }

    function three_setup() {
        const canvas = vars.canvas = $('canvas');

        WORLD.rotation.x = -PI2;
        SCENE.add(WORLD);

        // workaround for https://bugs.chromium.org/p/chromium/issues/detail?id=1321452
        // and android requires older rendered to avoid visual Z order artifacts
        const Renderer =
            (platform.indexOf('Linux') >= 0) ||
            (platform === 'MacIntel' && vendor.indexOf('Google') >= 0) ?
            WebGL1Renderer : WebGLRenderer;

        const renderer = vars.renderer = new Renderer({
            antialias: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true
        });
        renderer.localClippingEnabled = true;
        const camera = vars.camera = new PerspectiveCamera(35, aspect(), 0.1, 100000);

        camera.position.set(0, 600, 0);
        canvas.appendChild(renderer.domElement);
        renderer.setSize(width(), height());

        const orbit = vars.orbit = new Orbit(camera, canvas, (position, moved) => {
            // todo
        }, (val) => {
            // todo
        });

        orbit.noKeys = true;
        orbit.maxDistance = 1000;
        orbit.reverseZoom = true;

        SCENE.add(new AmbientLight(0x707070));

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(SCENE, camera);
        }

        function reset_home() {
            orbit.reset();
            orbit.update();
        }

        window.addEventListener('resize', on_resize);

        window.addEventListener('keypress', ev => {
            if (ev.code === 'KeyH') {
                reset_home();
            }
        });

        $('sys-view').onclick = reset_home;

        animate();
        orbit.update();
    }

    function on_resize() {
        const { camera, renderer } = vars;
        camera.aspect = aspect();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height());
    }

    function build_setup() {
        const { parse, newGeometry } = exports.obj;
        fetch('carvera.obj')
        .then(r => r.text())
        .then(obj => parse(obj))
        .then(obj => {
            const mesh = vars.mesh = { };
            for (let [ name, verts ] of Object.entries(obj)) {
                const color = {
                    'base':   0xdddddd,
                    'plate':  0x999999,
                    'corner': 0xeeeeee,
                    'fourth': 0xeeeeee,
                    'tower':  0xf3f3f3,
                    'tool-0': 0x0088ee,
                    'tool-1': 0x0088ee,
                    'tool-2': 0x0088ee,
                    'tool-3': 0x0088ee,
                    'tool-4': 0x0088ee,
                    'tool-5': 0x0088ee,
                    'tool-6': 0x0088ee,
                }[name];
                const geo = newGeometry(verts.map(v => v * 1000));
                const mat = matcap.clone();
                const meh = new Mesh(geo, mat);
                mat.color = new Color(color);
                geo.computeBoundingBox();
                WORLD.add(mesh[name] = meh);
            }
            const { corner, fourth } = mesh;
            corner.geometry.translate(0,0,0.01);
            corner.material.transparent = true;
            corner.material.opacity = 0.4;
            fourth.geometry.translate(0,0,0.01);
            fourth.material.transparent = true;
            fourth.material.opacity = 0.4;
            fourth.visible = false;
            // offset zero point using plate geo
            // vars.zero.z += plate.geometry.boundingBox.max.z;
            // create visibie machine head
            const hmat = matcap.clone();
            const head = vars.mesh.head = new Mesh(
                new THREE.CylinderGeometry(3, 1, 30, 10), hmat
            );
            const cmin = corner.geometry.boundingBox.min;
            vars.zero = {
                x: cmin.x + 15 + 360.495,
                y: cmin.y + 15 + 234.765,
                z: cmin.z + 30 + 100.436
            };
            hmat.color = new Color(0xf0f000);
            head.rotation.set(Math.PI / 2, 0, 0);
            // head.position.set(vars.zero.x, vars.zero.y, vars.zero.z);
            WORLD.add(head);
        });
    }

    function update_stock() {
        if (!$('stock-auto').checked) {
            config.stock_x = parseFloat($('stock-x').value);
            config.stock_y = parseFloat($('stock-y').value);
            config.stock_z = parseFloat($('stock-z').value);
            save_config();
        }
    }

    function bind_ui() {
        for (let radio of [0,1,2,3]) {
            $(`ank${radio}`).onchange = update_anchor;
        }
        // bind "+" "-" buttons to their input fields
        for (let b of [...document.getElementsByTagName('BUTTON')]) {
            let target;
            let idt = b.id.split('-');
            let diff = idt[1] === 'z' ? 5 : { 'stock': 10 }[idt[0]] || 1;
            if (idt[2] === 'dn') {
                target = $(b.id.substring(0,b.id.length - 3));
                diff *= -1;
            }
            if (idt[2] === 'up') {
                target = $(b.id.substring(0,b.id.length - 3));
            }
            if (target) {
                target.onchange = () => {
                    update_stock();
                    update_render()
                }
                b.onclick = () => {
                    target.value = Math.max(0,Math.min(Infinity,parseFloat(target.value)+diff));
                    update_stock();
                    update_render();
                };
            }
        }
        $('probe-ank').onclick =
        $('probe-grid').onclick =
        $('probe-none').onclick =
        $('run-box').onclick = update_render;
        $('run-start').onclick = run_start;
        $('run-cancel').onclick = run_cancel;
    }

    function update_anchor() {
        let sel = 0;
        for (let radio of [0,1,2,3]) {
            if ($(`ank${radio}`).checked) {
                sel = radio;
            }
        }
        vars.anchor = sel;
        const elids = [
            "ank0", "ank1", "ank2",
            "anko-y", "anko-y-up", "anko-y-dn",
            "probe-grid", "probe-x", "probe-y",
            "probe-x-up", "probe-x-dn",
            "probe-y-up", "probe-y-dn"
        ];
        elids.forEach(id => {
            $(id).disabled = config.job.axes > 3;
        });
        update_render();
    }

    function update_render(opt = {}) {
        const { mapo, bounds, job, status, origin } = config;
        if (!(mapo && bounds)) {
            return;
        }
        const { anchor, mesh, zero } = vars;
        const { corner, fourth } = mesh;
        const { coordinate } = mapo;
        const { anchor1_x, anchor1_y, anchor_width } = coordinate;
        const { rotation_offset_x, rotation_offset_y, rotation_offset_z } = coordinate;
        const is4th = anchor === 3;
        const anko_x = anchor ? parseFloat($('anko-x').value || 0) : 0;
        const anko_y = anchor && !is4th ? parseFloat($('anko-y').value || 0) : 0;
        const anko_z = anchor && is4th ? 78.5 : 0;
        const anko_w = anchor_width;
        const off = vars.anchor_offset = {
            x: anchor1_x + (is4th ? 0 : anko_x),
            y: anchor1_y + anko_y,
            z: 0,
            ox: anko_x,
            oy: anko_y,
            oz: rotation_offset_z
        };
        corner.visible = true;
        fourth.visible = false;
        switch (anchor) {
            case 0:
                corner.position.set(0, 0, 0);
                break;
            case 1:
                corner.position.set(0, 0, 0);
                break;
            case 2:
                const { anchor2_offset_x, anchor2_offset_y } = coordinate;
                corner.position.set(anchor2_offset_x, anchor2_offset_y, 0);
                off.x += anchor2_offset_x;
                off.y += anchor2_offset_y;
                break;
            case 3:
                corner.visible = false;
                fourth.visible = true;
                corner.position.set(rotation_offset_x, rotation_offset_y, 0);
                off.x += rotation_offset_x;
                off.y += rotation_offset_y;
                break;
        }
        WORLD.remove(vars.stock);
        WORLD.remove(vars.build);
        WORLD.remove(vars.bound);
        WORLD.remove(vars.anchr);
        const stockG = vars.stock = new Group();
        const buildG = vars.build = new Group();
        const boundG = vars.bound = new Group();
        const anchrG = vars.anchr = new Group();
        const cmin = corner.geometry.boundingBox.min;
        const cpos = corner.position;
        const home = {
            x: cpos.x + cmin.x,
            y: cpos.y + cmin.y,
            z: cpos.z + cmin.z
        };
        stockG.position.set(
            home.x + anko_w,
            home.y + anko_w,
            home.z + anko_z
        );
        buildG.position.set(
            home.x + anko_w + anko_x,
            home.y + anko_w + anko_y,
            home.z + anko_z
        );
        boundG.position.set(
            home.x + anko_w + anko_x,
            home.y + anko_w + anko_y,
            home.z + anko_z
        );
        anchrG.position.set(
            home.x + anko_w + (is4th ? 0 : anko_x),
            home.y + anko_w + (is4th ? 0 : anko_y),
            home.z + anko_z
        );
        const { span, min } = bounds;
        const stock = {
            X: parseFloat($('stock-x').value),
            Y: parseFloat($('stock-y').value),
            Z: parseFloat($('stock-z').value),
        };
        const stck = createBounds(stock.X, stock.Y, stock.Z, 0xffff00);
        const bnds = createBounds(span.X, span.Y, span.Z, 0x00ff00);
        stockG.add(stck);
        boundG.add(bnds);
        if ($('probe-none').checked) {
            // do nothing
        } else if ($('probe-grid').checked && !is4th) {
            const px = parseInt($('probe-x').value || 0) - 1;
            const py = parseInt($('probe-y').value || 0) - 1;
            const dx = span.X / px;
            const dy = span.Y / py;
            const ex = min.X + span.X;
            const ey = min.Y + span.Y;
            for (let i = min.X; i <= ex; i += dx) {
                for (let j = min.Y; j <= ey; j += dy) {
                    anchrG.add(createSpot(i, j, stock.Z));
                }
            }
        } else if ($('probe-ank').checked) {
            if (is4th) {
                anchrG.add(createSpot(0, 0, 0));
            } else {
                anchrG.add(createSpot(min.X, min.Y, stock.Z));
            }
        }
        if (is4th) {
            bnds.position.set(min.X, min.Y, min.Z - rotation_offset_z);
            stck.position.x += 30;
            stck.position.y -= stock.Y / 2;
            stck.position.z -= stock.Z / 2;
            stockG.position.z -= rotation_offset_z;
        } else {
            bnds.position.set(min.X, min.Y, min.Z + stock.Z);
        }
        if ($('run-box').checked) {
            const runbox = createSquare(span.X, span.Y, span.Z + is4th ? 0 : stock.Z);
            runbox.position.set(min.X, min.Y, min.Z);
            buildG.add(runbox);
        }
        if (!vars.moves && job && job.moves) {
            vars.moves = createMoves(job.moves);
        }
        if (vars.moves) {
            stockG.add(vars.moves);
            vars.moves.position.set(anko_x, anko_y, is4th ? 0 : stock.Z);
        }
        WORLD.add(stockG);
        WORLD.add(buildG);
        WORLD.add(boundG);
        WORLD.add(anchrG);
        mesh.head.position.set(
            zero.x + status.mpos[0],
            zero.y + status.mpos[1],
            zero.z + status.mpos[2] - (status.tool ? status.tool[1] : 0)
        );
        const angle = is4th ? (status.mpos[3] || 0) : 0;
        vars.stock.rotation.x = angle * DEG2RAD;
        if (status.play && job.moves) {
            setDrawFromLineNo(status.play[0]);
        }
        updateRunProgress(status.play ? status.play[1] || 0 : 0);
        if (opt.focus) {
            vars.orbit.setPosition({
                up: 0,
                left: 0,
                panX: buildG.position.x + span.X / 2,
                panY: 0,
                panZ: -(buildG.position.y + span.Y / 2)
            });
        }
        vars.orbit.update();
    }

    function setDrawFromLineNo(lineno) {
        const moves = config.job.moves;
        const last = vars.last_draw;
        for (let i = last; i < moves.length; i++) {
            let mlno = moves[i][0];
            if (mlno >= lineno) {
                vars.moves.geometry.setDrawRange(0, i * 2);
                vars.last_draw = i;
                break;
            }
         }
    }

    function updateRunProgress(prog) {
        const text = `${prog}%`;
        $('run-pct').innerText = text;
        $('run-meter').style.width = text;
        if (config.status.state === 'Run') {
            $('run-prog').classList.remove('idle');
            vars.anchr.visible = false;
            vars.bound.visible = false;
        } else {
            $('run-prog').classList.add('idle');
            vars.anchr.visible = true;
            vars.bound.visible = true;
        }
    }

    function createMoves(moves) {
        vars.last_draw = 0;
        const geo = new BufferGeometry();
        const mat0 = new LineBasicMaterial();
        const mat1 = new LineBasicMaterial();
        mat0.color = new Color(0x30a0f0);
        mat1.color = new Color(0xa0a0a0);
        const arr = [];
        const grp = { start: 0, count: 0, mat: 0 };
        for (let i=1, l=moves.length; i<l; i++) {
            let lp = moves[i-1];
            let cp = moves[i];
            let mg = 1 - cp[1];
            let [ lpx, lpy, lpz, lpa ] = lp.slice(2);
            let [ cpx, cpy, cpz, cpa ] = cp.slice(2);
            if (lpa) {
                const v2 = new Vector2(lpy, lpz).rotateAround(origin2d, lpa * DEG2RAD);
                lpy = v2.x;
                lpz = v2.y;
            }
            if (cpa) {
                const v2 = new Vector2(cpy, cpz).rotateAround(origin2d, cpa * DEG2RAD);
                cpy = v2.x;
                cpz = v2.y;
            }
            arr.push(lpx, lpy, lpz);
            arr.push(cpx, cpy, cpz);
            if (mg !== grp.mat) {
                if (i > 1) geo.addGroup(
                    grp.start * 2,
                    (i - grp.start - 1) * 2,
                    grp.mat
                );
                grp.start = i - 1;
                grp.count = 1;
                grp.mat = mg;
            }
        }
        geo.addGroup(
            grp.start * 2,
            (moves.length - grp.start - 1) * 2,
            grp.mat
        );
        geo.setAttribute('position', new BufferAttribute(new Float32Array(arr), 3));
        return new LineSegments(geo, [ mat0, mat1 ]);
    }

    function createSquare(x, y, z) {
        const geo = new BufferGeometry();
        const mat = new LineBasicMaterial();
        mat.color = new Color(0xff0000);
        geo.setAttribute('position', new BufferAttribute(new Float32Array([
            0, 0, z,   x, 0, z,
            0, 0, z,   0, y, z,
            x, 0, z,   x, y, z,
            0, y, z,   x, y, z
        ]), 3));
        return new LineSegments(geo, mat);
    }

    function createBounds(x, y, z, color) {
        x /= 2, y /= 2, z /= 2;
        const geo = new BufferGeometry();
        const mat = new LineBasicMaterial();
        mat.color = new Color(color || 0x00ff00);
        geo.setAttribute('position', new BufferAttribute(new Float32Array([
            -x, -y, -z,   x, -y, -z,
            -x, -y, -z,  -x,  y, -z,
            -x, -y, -z,  -x, -y,  z,
             x,  y,  z,  -x,  y,  z,
             x,  y,  z,   x, -y,  z,
             x,  y,  z,   x,  y, -z,
            -x,  y, -z,  -x,  y,  z,
            -x, -y,  z,  -x,  y,  z,
            -x, -y,  z,   x, -y,  z,
             x, -y,  z,   x, -y, -z,
             x,  y, -z,   x, -y, -z,
             x,  y, -z,  -x,  y, -z,
        ]), 3));
        const lines = new LineSegments(geo, mat);
        geo.translate(x, y, z);
        return lines;
    }

    function createSpot(x,y,z) {
        const box = new BoxGeometry();
        const mat = matcap.clone();
        mat.color = new Color(0xff0000);
        const meh = new Mesh(box, mat);
        meh.scale.set(5, 5, 5);
        meh.position.set(x, y, z);
        return meh;
    }

    function run_start() {
        // M495 X1 Y1 O5 F5 A9 B9 I3 J5 H2 [CR][LF]
        // x,y = start position for scan/probe
        // c,d = boundary scan size x,y starting at x,y
        // o,f = z probe offset from x,y
        // o without f means 4 axis probe and position ignores x,y
        // a,b = size of grid probe x,y
        // i,j = x,y grid points
        // h = z move clearance between grid points
        // p = return to position after probe

        // set origin, start job
        // G10 L2 P0 X-355.395 Y-229.765 [LF]
        // buffer M495 X1.425 Y0.2375 O5 F5 [LF]
        // play /sd/gcodes/cube-005.nc [LF]

        if (!config.selected_file) {
            log('no file selected');
            return;
        }
        const { mapo, bounds } = config;
        if (!bounds) {
            log('missing bounds');
            return;
        }
        update_render();
        const is4th = vars.anchor === 3;
        const off = vars.anchor_offset;
        const xyo = {
            x: (is4th ? off.x + off.ox : off.x),
            y: off.y
        };
        log({ is4th, xyo, off, bounds });
        const g10 = [ 'G10', 'L2', 'P0', `X${xyo.x}`, `Y${xyo.y}` ];
        const bmx = Math.max(0, bounds.min.X);
        const bmy = is4th ? bounds.min.Y : Math.max(0, bounds.min.Y);
        const m495 = [ 'M495', `X${bmx}`, `Y${bmy}` ];
        if ($('run-box').checked) {
            m495.push(`C${bounds.span.X}`, `D${bounds.span.Y}`);
        }
        if ($('probe-ank').checked) {
            // probe offset from anchor
            if (is4th) {
                m495.push(`O0`, `P1`);
            } else {
                m495.push(`O0`, `F0`);
            }
        }
        if (!is4th && $('probe-grid').checked) {
            // probe offset from anchor
            // m495.push(`O${off.ox}`, `F${off.oy}`);
            m495.push(`O0`, `F0`);
            // mesh z probe box size
            m495.push(`A${bounds.span.X}`, `B${bounds.span.Y}`);
            // mesh x,y probe points
            const IX = parseInt($('probe-x').value);
            const JY = parseInt($('probe-y').value);
            m495.push(`I${IX}`, `J${JY}`);
            // todo: gather mesh z clearance between points
            m495.push(`H3`);
        }
        const { dir, file } = config.selected_file;
        const msg = [];
        if (vars.anchor) {
            msg.push('<label>this will update the origin</label>');
            log('>>', g10.join(' '));
            gcmd(g10.join(' '));
        }
        msg.push('<label>ready to start the job?</label>');
        $('mod-ok').onclick = () => {
            set_modal(false);
            log('>> buffer', m495.join(' '));
            log('run selected', dir, file);
            if (localStorage.nostart) {
                gcmd(`${m495.join('')}`);
                gcmd(`G0 X0 Y0 F3000`);
            } else {
                gcmd(`buffer ${m495.join('')}`);
                run(`${dir}${file}`);
            }
        };
        $('mod-cancel').onclick = () => {
            set_modal(false);
        };
        set_modal(msg.join(''));
        show_modal_buttons(true);
    }

    function run_cancel() {
        hide();
    }

    function show() {
        $('runit').style.zIndex = 100;
        if (config.job.axes > 3) {
            $('ank3').click();
            $('anko-x').value = 50;
            $('anko-y').value = 0;
            $('probe-ank').click();
        }
        $('ank0').onchange();
    }

    function hide() {
        $('runit').style.zIndex = -100;
    }

    function init() {
        three_setup();
        build_setup();
        bind_ui();
        update_render();
    }

    function run_check() {
        const { status, bounds, mapo, selected_file } = config;
        const { state, tool } = status;
        const was_running = vars.running;
        const is_running = vars.running = state === 'Run';
        if (was_running !== is_running) {
            $('run-setup').style.display = is_running ? 'none' : '';
            // $('job-ctrl').style.display = is_running ? '' : 'none';
            on_resize();
        }
        $('sys-unlock').disabled = state !== 'Alarm';
        $('sys-resume').disabled = state !== 'Hold' && state !== 'Alarm';
        $('sys-hold').disabled = state === 'Hold';
        let canrun = (
            state === 'Idle' &&
            selected_file &&
            bounds &&
            mapo
        );
        $('run-start').disabled = !canrun;
        $('file-run').disabled =
        $('file-load').disabled =
        $('file-delete').disabled = !selected_file;
        if (vars.mesh) {
            const toolNum = tool ? tool[0] : undefined;
            for (let i = 0; i <= 6; i++) {
                vars.mesh[`tool-${i}`].visible = (i === toolNum);
            }
        }
        update_render();
        return canrun;
    }

    function run_clear() {
        delete vars.moves;
    }

    function run_setup() {
        if (config.selected_file) {
            update_render({ focus: true });
            show();
        }
    }

    exports.canvas = {
        vars,
        init,
        run_check,
        run_clear,
        run_setup,
        run_cancel,
        set_draw_line: setDrawFromLineNo
    };

})();
