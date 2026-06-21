(() => {
  "use strict";

  const RED = "#e1263f";
  const INK = "#17202a";
  const PAPER = "#fbfaf7";
  const PIN_RADIUS_FACTOR = 1.56;
  const PIN_HIT_FACTOR = 2.35;
  const STROKE_FACTOR = 0.32;
  const PATH_HIT_FACTOR = 1.15;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const canvasWrap = document.getElementById("canvasWrap");
  const emptyState = document.getElementById("emptyState");
  const imageInput = document.getElementById("imageInput");
  const textEditor = document.getElementById("textEditor");
  const undoButton = document.getElementById("undoButton");
  const redoButton = document.getElementById("redoButton");
  const clearButton = document.getElementById("clearButton");
  const deleteButton = document.getElementById("deleteButton");
  const copyButton = document.getElementById("copyButton");
  const textSheet = document.getElementById("textSheet");
  const textDoneButton = document.getElementById("textDoneButton");
  const textCancelButton = document.getElementById("textCancelButton");
  const zoomOutButton = document.getElementById("zoomOutButton");
  const zoomFitAllButton = document.getElementById("zoomFitAllButton");
  const zoomFitWidthButton = document.getElementById("zoomFitWidthButton");
  const zoomActualButton = document.getElementById("zoomActualButton");
  const zoomInButton = document.getElementById("zoomInButton");
  const zoomValue = document.getElementById("zoomValue");
  const toast = document.getElementById("toast");
  const toolButtons = [...document.querySelectorAll("[data-tool]")];

  let backgroundImage = null;
  let backgroundRect = null;
  let annotations = [];
  let nextPinNumber = 1;
  let activeTool = "pin";
  let selectedId = null;
  let gesture = null;
  let draft = null;
  let history = [];
  let future = [];
  let editorState = null;
  let toastTimer = null;
  let unit = 28;
  let viewScale = 1;
  let zoomMode = "width";

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentState() {
    return {
      annotations: deepCopy(annotations),
      nextPinNumber
    };
  }

  function restoreState(state) {
    annotations = deepCopy(state.annotations);
    nextPinNumber = state.nextPinNumber;
    selectedId = null;
    hideTextEditor(false);
    updateCanvasInteraction();
    render();
    updateActions();
  }

  function pushHistory() {
    history.push(currentState());
    if (history.length > 80) history.shift();
    future = [];
    updateActions();
  }

  function updateActions() {
    const ready = Boolean(backgroundImage);
    undoButton.disabled = !ready || history.length === 0;
    redoButton.disabled = !ready || future.length === 0;
    clearButton.disabled = !ready || annotations.length === 0;
    deleteButton.disabled = !ready || !selectedId;
    copyButton.disabled = !ready;
    updateZoomControls();
  }

  function updateZoomControls() {
    const ready = Boolean(backgroundImage);
    [zoomOutButton, zoomFitAllButton, zoomFitWidthButton, zoomActualButton, zoomInButton].forEach((button) => {
      button.disabled = !ready;
    });
    zoomOutButton.disabled = !ready || viewScale <= 0.25;
    zoomInButton.disabled = !ready || viewScale >= 2;
    zoomValue.textContent = ready ? `${Math.round(viewScale * 100)}%` : "—";
    zoomFitAllButton.classList.toggle("active", ready && zoomMode === "all");
    zoomFitWidthButton.classList.toggle("active", ready && zoomMode === "width");
    zoomActualButton.classList.toggle("active", ready && zoomMode === "actual");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function setTool(tool) {
    activeTool = tool;
    selectedId = null;
    toolButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
    canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    updateCanvasInteraction();
    render();
    updateActions();
  }

  function updateCanvasInteraction() {
    canvas.classList.toggle("scroll-mode", activeTool === "select" && !selectedId);
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function applyViewScale(scale, mode = "manual") {
    if (!backgroundImage) return;
    viewScale = clamp(scale, 0.25, 2);
    zoomMode = mode;
    canvas.style.width = `${Math.round(canvas.width * viewScale)}px`;
    canvas.style.height = `${Math.round(canvas.height * viewScale)}px`;
    updateZoomControls();
  }

  function fitCanvasToViewport(mode = zoomMode) {
    if (!backgroundImage) return;
    if (mode === "manual" || mode === "actual") {
      applyViewScale(viewScale, mode);
      return;
    }
    const availableWidth = Math.max(240, stage.clientWidth - 16);
    const availableHeight = Math.max(240, stage.clientHeight - 16);
    const widthScale = availableWidth / canvas.width;
    const heightScale = availableHeight / canvas.height;
    const scale = mode === "all"
      ? Math.min(1, widthScale, heightScale)
      : Math.min(1, widthScale);
    applyViewScale(scale, mode);
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("画像ファイルを選んでください");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      setupImage(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showToast("画像を開けませんでした");
    };
    image.src = url;
  }

  function setupImage(image) {
    backgroundImage = image;
    annotations = [];
    nextPinNumber = 1;
    selectedId = null;
    history = [];
    future = [];

    unit = clamp(Math.min(image.naturalWidth, image.naturalHeight) / 38, 22, 44);
    const margin = Math.round(clamp(unit * 1.6, 36, 72));
    canvas.width = image.naturalWidth + margin * 2;
    canvas.height = image.naturalHeight + margin * 2;
    backgroundRect = {
      x: margin,
      y: margin,
      width: image.naturalWidth,
      height: image.naturalHeight
    };

    emptyState.hidden = true;
    canvasWrap.hidden = false;
    setTool("pin");
    fitCanvasToViewport("width");
    render();
    updateActions();
    canvas.focus();
    showToast("スクショを貼り付けました");
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function wrapText(context, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text).split(/\r?\n/);

    for (const paragraph of paragraphs) {
      if (!paragraph) {
        lines.push("");
        continue;
      }

      let line = "";
      for (const character of [...paragraph]) {
        const test = line + character;
        if (line && context.measureText(test).width > maxWidth) {
          lines.push(line);
          line = character;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }

    return lines.length ? lines : [""];
  }

  function getTextMetrics(annotation, context = ctx) {
    const fontSize = annotation.fontSize || Math.round(unit * 0.92);
    const width = annotation.width || Math.round(unit * 12);
    const padding = Math.round(unit * 0.52);
    context.save();
    context.font = `700 ${fontSize}px "Yu Gothic UI", "Meiryo", sans-serif`;
    const lines = wrapText(context, annotation.text, width - padding * 2);
    context.restore();
    const lineHeight = fontSize * 1.45;
    const height = Math.max(unit * 2.2, padding * 2 + lineHeight * lines.length);
    return { fontSize, width, padding, lines, lineHeight, height };
  }

  function drawAnnotation(context, annotation, withSelection) {
    const strokeWidth = Math.max(8, unit * STROKE_FACTOR);
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    if (annotation.type === "pin") {
      const radius = unit * PIN_RADIUS_FACTOR;
      context.beginPath();
      context.arc(annotation.x, annotation.y, radius, 0, Math.PI * 2);
      context.fillStyle = RED;
      context.fill();
      context.lineWidth = Math.max(4, unit * 0.14);
      context.strokeStyle = "#ffffff";
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = `800 ${Math.round(unit * 1.6)}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(annotation.number), annotation.x, annotation.y + unit * 0.04);
    }

    if (annotation.type === "circle") {
      const centerX = (annotation.x1 + annotation.x2) / 2;
      const centerY = (annotation.y1 + annotation.y2) / 2;
      const radiusX = Math.abs(annotation.x2 - annotation.x1) / 2;
      const radiusY = Math.abs(annotation.y2 - annotation.y1) / 2;
      context.beginPath();
      context.ellipse(centerX, centerY, Math.max(1, radiusX), Math.max(1, radiusY), 0, 0, Math.PI * 2);
      context.strokeStyle = RED;
      context.lineWidth = strokeWidth;
      context.stroke();
    }

    if (annotation.type === "box") {
      const x = Math.min(annotation.x1, annotation.x2);
      const y = Math.min(annotation.y1, annotation.y2);
      const width = Math.abs(annotation.x2 - annotation.x1);
      const height = Math.abs(annotation.y2 - annotation.y1);
      context.beginPath();
      context.rect(x, y, width, height);
      context.strokeStyle = RED;
      context.lineWidth = strokeWidth;
      context.stroke();
    }

    if (annotation.type === "line") {
      context.beginPath();
      context.moveTo(annotation.x1, annotation.y1);
      context.lineTo(annotation.x2, annotation.y2);
      context.strokeStyle = RED;
      context.lineWidth = strokeWidth;
      context.stroke();
    }

    if (annotation.type === "freehand" && annotation.points.length) {
      context.beginPath();
      context.moveTo(annotation.points[0].x, annotation.points[0].y);
      annotation.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.strokeStyle = RED;
      context.lineWidth = strokeWidth;
      context.stroke();
    }

    if (annotation.type === "text") {
      const metrics = getTextMetrics(annotation, context);
      roundedRectPath(context, annotation.x, annotation.y, metrics.width, metrics.height, unit * 0.28);
      context.fillStyle = "rgba(255, 255, 255, 0.96)";
      context.fill();
      context.strokeStyle = RED;
      context.lineWidth = Math.max(3, unit * 0.11);
      context.stroke();
      context.fillStyle = INK;
      context.font = `700 ${metrics.fontSize}px "Yu Gothic UI", "Meiryo", sans-serif`;
      context.textAlign = "left";
      context.textBaseline = "top";
      metrics.lines.forEach((line, index) => {
        context.fillText(
          line,
          annotation.x + metrics.padding,
          annotation.y + metrics.padding + index * metrics.lineHeight
        );
      });
    }

    if (withSelection && annotation.id === selectedId) {
      const bounds = getBounds(annotation, context);
      context.setLineDash([unit * 0.28, unit * 0.22]);
      context.strokeStyle = "#2079d4";
      context.lineWidth = Math.max(2, unit * 0.08);
      context.strokeRect(
        bounds.x - unit * 0.22,
        bounds.y - unit * 0.22,
        bounds.width + unit * 0.44,
        bounds.height + unit * 0.44
      );
      if (annotation.type === "text") {
        const handleSize = unit * 0.48;
        context.setLineDash([]);
        context.fillStyle = "#2079d4";
        context.fillRect(
          bounds.x + bounds.width - handleSize / 2,
          bounds.y + bounds.height - handleSize / 2,
          handleSize,
          handleSize
        );
        context.strokeStyle = "#ffffff";
        context.lineWidth = Math.max(2, unit * 0.07);
        context.strokeRect(
          bounds.x + bounds.width - handleSize / 2,
          bounds.y + bounds.height - handleSize / 2,
          handleSize,
          handleSize
        );
      }

      const moveHandle = getMoveHandle(annotation, context);
      const handleRadius = unit * 1.15;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(moveHandle.x, moveHandle.anchorY);
      context.lineTo(moveHandle.x, moveHandle.y);
      context.strokeStyle = "#2079d4";
      context.lineWidth = Math.max(3, unit * 0.1);
      context.stroke();
      context.beginPath();
      context.arc(moveHandle.x, moveHandle.y, handleRadius, 0, Math.PI * 2);
      context.fillStyle = "#2079d4";
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(3, unit * 0.1);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = `800 ${Math.round(unit * 1.25)}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("✥", moveHandle.x, moveHandle.y + unit * 0.03);
    }

    context.restore();
  }

  function drawScene(context, withSelection = true) {
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = PAPER;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundImage && backgroundRect) {
      context.shadowColor = "rgba(20, 28, 36, 0.18)";
      context.shadowBlur = unit * 0.7;
      context.shadowOffsetY = unit * 0.2;
      context.fillStyle = "#ffffff";
      context.fillRect(backgroundRect.x, backgroundRect.y, backgroundRect.width, backgroundRect.height);
      context.shadowColor = "transparent";
      context.drawImage(
        backgroundImage,
        backgroundRect.x,
        backgroundRect.y,
        backgroundRect.width,
        backgroundRect.height
      );
    }

    annotations.forEach((annotation) => drawAnnotation(context, annotation, withSelection));
    if (draft) drawAnnotation(context, draft, false);
    context.restore();
  }

  function render() {
    if (!backgroundImage) return;
    drawScene(ctx, true);
  }

  function getBounds(annotation, context = ctx) {
    if (annotation.type === "pin") {
      const radius = unit * PIN_RADIUS_FACTOR;
      return { x: annotation.x - radius, y: annotation.y - radius, width: radius * 2, height: radius * 2 };
    }
    if (annotation.type === "circle" || annotation.type === "box" || annotation.type === "line") {
      const x = Math.min(annotation.x1, annotation.x2);
      const y = Math.min(annotation.y1, annotation.y2);
      return {
        x,
        y,
        width: Math.max(unit * 0.2, Math.abs(annotation.x2 - annotation.x1)),
        height: Math.max(unit * 0.2, Math.abs(annotation.y2 - annotation.y1))
      };
    }
    if (annotation.type === "freehand") {
      const xs = annotation.points.map((point) => point.x);
      const ys = annotation.points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        x,
        y,
        width: Math.max(unit * 0.2, Math.max(...xs) - x),
        height: Math.max(unit * 0.2, Math.max(...ys) - y)
      };
    }
    if (annotation.type === "text") {
      const metrics = getTextMetrics(annotation, context);
      return { x: annotation.x, y: annotation.y, width: metrics.width, height: metrics.height };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
  }

  function containsPoint(annotation, point) {
    if (annotation.type === "pin") {
      return Math.hypot(point.x - annotation.x, point.y - annotation.y) <= unit * PIN_HIT_FACTOR;
    }

    if (annotation.type === "line") {
      return pointToSegmentDistance(
        point,
        { x: annotation.x1, y: annotation.y1 },
        { x: annotation.x2, y: annotation.y2 }
      ) <= unit * PATH_HIT_FACTOR;
    }

    if (annotation.type === "freehand") {
      for (let index = 1; index < annotation.points.length; index += 1) {
        if (pointToSegmentDistance(point, annotation.points[index - 1], annotation.points[index]) <= unit * PATH_HIT_FACTOR) {
          return true;
        }
      }
      return false;
    }

    const bounds = getBounds(annotation);
    if (annotation.type === "circle") {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const rx = Math.max(bounds.width / 2, 1);
      const ry = Math.max(bounds.height / 2, 1);
      const normalized = Math.sqrt(((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2);
      return Math.abs(normalized - 1) <= 0.18 || (
        point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y && point.y <= bounds.y + bounds.height
      );
    }

    if (annotation.type === "box") {
      return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    }

    const hitPadding = unit * 0.9;
    return point.x >= bounds.x - hitPadding && point.x <= bounds.x + bounds.width + hitPadding &&
      point.y >= bounds.y - hitPadding && point.y <= bounds.y + bounds.height + hitPadding;
  }

  function hitTest(point) {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      if (containsPoint(annotations[index], point)) return annotations[index];
    }
    return null;
  }

  function hitSelectedTextResizeHandle(point) {
    const annotation = annotations.find((item) => item.id === selectedId && item.type === "text");
    if (!annotation) return null;
    const bounds = getBounds(annotation);
    const handleX = bounds.x + bounds.width;
    const handleY = bounds.y + bounds.height;
    return Math.hypot(point.x - handleX, point.y - handleY) <= unit * 0.75 ? annotation : null;
  }

  function getMoveHandle(annotation, context = ctx) {
    const bounds = getBounds(annotation, context);
    const placeAbove = bounds.y >= unit * 3;
    return {
      x: bounds.x + bounds.width / 2,
      y: placeAbove ? bounds.y - unit * 1.55 : bounds.y + bounds.height + unit * 1.55,
      anchorY: placeAbove ? bounds.y - unit * 0.22 : bounds.y + bounds.height + unit * 0.22
    };
  }

  function hitSelectedMoveHandle(point) {
    const annotation = annotations.find((item) => item.id === selectedId);
    if (!annotation) return null;
    const handle = getMoveHandle(annotation);
    return Math.hypot(point.x - handle.x, point.y - handle.y) <= unit * 2.5 ? annotation : null;
  }

  function renumberPins() {
    const pins = annotations.filter((annotation) => annotation.type === "pin");
    pins.forEach((pin, index) => {
      pin.number = index + 1;
    });
    nextPinNumber = pins.length + 1;
  }

  function moveAnnotation(annotation, dx, dy) {
    if (annotation.type === "pin" || annotation.type === "text") {
      annotation.x += dx;
      annotation.y += dy;
      return;
    }
    if (annotation.type === "freehand") {
      annotation.points.forEach((point) => {
        point.x += dx;
        point.y += dy;
      });
      return;
    }
    annotation.x1 += dx;
    annotation.x2 += dx;
    annotation.y1 += dy;
    annotation.y2 += dy;
  }

  function onPointerDown(event) {
    if (!backgroundImage || event.button !== 0 || editorState) return;
    const point = getPoint(event);
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);

    const resizeTarget = hitSelectedTextResizeHandle(point);
    if (resizeTarget) {
      pushHistory();
      gesture = {
        type: "resize-text",
        pointerId: event.pointerId,
        annotationId: resizeTarget.id,
        startX: point.x,
        startWidth: resizeTarget.width
      };
      render();
      return;
    }

    const moveHandleTarget = hitSelectedMoveHandle(point);
    if (moveHandleTarget) {
      pushHistory();
      gesture = {
        type: "move",
        pointerId: event.pointerId,
        last: point,
        annotationId: moveHandleTarget.id
      };
      render();
      return;
    }

    const directMoveTarget = hitTest(point);
    if (
      event.pointerType === "touch" &&
      activeTool === "select" &&
      directMoveTarget &&
      selectedId !== directMoveTarget.id
    ) {
      selectedId = directMoveTarget.id;
      updateCanvasInteraction();
      render();
      updateActions();
      showToast("選択しました。もう一度ドラッグで移動できます");
      return;
    }

    if (
      activeTool !== "text" &&
      directMoveTarget &&
      (directMoveTarget.type === "pin" || directMoveTarget.type === "text")
    ) {
      selectedId = directMoveTarget.id;
      updateCanvasInteraction();
      pushHistory();
      gesture = {
        type: "move",
        pointerId: event.pointerId,
        last: point,
        annotationId: directMoveTarget.id
      };
      render();
      return;
    }

    if (activeTool === "select") {
      const target = hitTest(point);
      selectedId = target?.id || null;
      updateCanvasInteraction();
      if (target) {
        pushHistory();
        gesture = {
          type: "move",
          pointerId: event.pointerId,
          last: point,
          annotationId: target.id
        };
      }
      render();
      updateActions();
      return;
    }

    if (activeTool === "pin") {
      pushHistory();
      const pin = { id: uid(), type: "pin", x: point.x, y: point.y, number: nextPinNumber };
      annotations.push(pin);
      nextPinNumber += 1;
      selectedId = pin.id;
      render();
      updateActions();
      setTool("select");
      return;
    }

    if (activeTool === "text") {
      openTextEditor(point);
      return;
    }

    if (activeTool === "circle" || activeTool === "box") {
      pushHistory();
      draft = {
        id: uid(),
        type: activeTool,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y
      };
      gesture = { type: "draw", pointerId: event.pointerId };
      render();
    }

    if (activeTool === "line") {
      pushHistory();
      draft = {
        id: uid(),
        type: "freehand",
        points: [point]
      };
      gesture = { type: "draw-freehand", pointerId: event.pointerId };
      render();
    }
  }

  function onPointerMove(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = getPoint(event);

    if (gesture.type === "move") {
      const annotation = annotations.find((item) => item.id === gesture.annotationId);
      if (!annotation) return;
      moveAnnotation(annotation, point.x - gesture.last.x, point.y - gesture.last.y);
      gesture.last = point;
      render();
      return;
    }

    if (gesture.type === "resize-text") {
      const annotation = annotations.find((item) => item.id === gesture.annotationId);
      if (!annotation) return;
      const maximumWidth = Math.max(unit * 5, canvas.width - annotation.x - unit * 0.5);
      annotation.width = clamp(
        gesture.startWidth + point.x - gesture.startX,
        unit * 5,
        maximumWidth
      );
      render();
      return;
    }

    if (gesture.type === "draw" && draft) {
      draft.x2 = point.x;
      draft.y2 = point.y;
      render();
    }

    if (gesture.type === "draw-freehand" && draft) {
      const previous = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - previous.x, point.y - previous.y) >= unit * 0.08) {
        draft.points.push(point);
        render();
      }
    }
  }

  function onPointerUp(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if ((gesture.type === "draw" || gesture.type === "draw-freehand") && draft) {
      const bounds = getBounds(draft);
      if (bounds.width > unit * 0.35 || bounds.height > unit * 0.35) {
        annotations.push(draft);
        selectedId = draft.id;
      } else {
        history.pop();
      }
      draft = null;
    }

    gesture = null;
    render();
    updateActions();
  }

  function openTextEditor(point) {
    const target = hitTest(point);
    const existing = target?.type === "text" ? target : null;
    editorState = {
      point,
      annotationId: existing?.id || null,
      originalText: existing?.text || ""
    };
    selectedId = existing?.id || null;
    updateCanvasInteraction();
    textEditor.value = existing?.text || "";
    textSheet.hidden = false;
    textEditor.focus();
    textEditor.select();
    render();
  }

  function commitTextEditor() {
    if (!editorState) return;
    const value = textEditor.value.trim();

    let savedId = editorState.annotationId;
    if (editorState.annotationId) {
      const existing = annotations.find((item) => item.id === editorState.annotationId);
      if (existing && value && value !== existing.text) {
        pushHistory();
        existing.text = value;
      }
    } else if (value) {
      pushHistory();
      const annotation = {
        id: uid(),
        type: "text",
        x: editorState.point.x,
        y: editorState.point.y,
        width: Math.round(unit * 12),
        fontSize: Math.round(unit * 0.92),
        text: value
      };
      annotations.push(annotation);
      selectedId = annotation.id;
      savedId = annotation.id;
    }

    hideTextEditor(false);
    setTool("select");
    selectedId = savedId;
    updateCanvasInteraction();
    render();
    updateActions();
  }

  function hideTextEditor(refocus = true) {
    editorState = null;
    textSheet.hidden = true;
    textEditor.value = "";
    if (refocus && backgroundImage) canvas.focus();
  }

  function deleteSelected() {
    if (!selectedId) return;
    const index = annotations.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    pushHistory();
    annotations.splice(index, 1);
    renumberPins();
    selectedId = null;
    updateCanvasInteraction();
    render();
    updateActions();
  }

  function undo() {
    if (!history.length) return;
    future.push(currentState());
    restoreState(history.pop());
  }

  function redo() {
    if (!future.length) return;
    history.push(currentState());
    restoreState(future.pop());
  }

  function clearAnnotations() {
    if (!annotations.length) return;
    pushHistory();
    annotations = [];
    nextPinNumber = 1;
    selectedId = null;
    updateCanvasInteraction();
    render();
    updateActions();
    showToast("書き込みを消しました");
  }

  function canvasBlob() {
    return new Promise((resolve, reject) => {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportContext = exportCanvas.getContext("2d");

      exportContext.fillStyle = PAPER;
      exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportContext.drawImage(
        backgroundImage,
        backgroundRect.x,
        backgroundRect.y,
        backgroundRect.width,
        backgroundRect.height
      );
      annotations.forEach((annotation) => drawAnnotation(exportContext, annotation, false));

      exportCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNGの作成に失敗しました"));
      }, "image/png");
    });
  }

  function downloadBlob(blob) {
    const link = document.createElement("a");
    link.download = `redline-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function copyBoard() {
    if (!backgroundImage) return;
    const originalLabel = copyButton.textContent;
    copyButton.disabled = true;
    copyButton.textContent = "準備中…";

    try {
      const blob = await canvasBlob();
      const file = new File([blob], `redline-${Date.now()}.png`, { type: "image/png" });
      const canShareFiles = Boolean(
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      );

      if (canShareFiles) {
        try {
          await navigator.share({
            title: "赤入れ画像",
            text: "赤入れしたスクリーンショット",
            files: [file]
          });
          showToast("共有先へ画像を渡しました");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }

      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("画像をコピーしました");
      } else {
        downloadBlob(blob);
        showToast("PNG画像として保存しました");
      }
    } catch {
      try {
        const blob = await canvasBlob();
        downloadBlob(blob);
        showToast("PNG画像として保存しました");
      } catch {
        showToast("画像を共有できませんでした");
      }
    } finally {
      copyButton.disabled = false;
      copyButton.textContent = originalLabel;
    }
  }

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  imageInput.addEventListener("change", (event) => {
    loadImageFile(event.target.files?.[0]);
    imageInput.value = "";
  });

  window.addEventListener("paste", (event) => {
    if (event.target === textEditor || event.target.matches("input, textarea")) return;
    const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    loadImageFile(imageItem.getAsFile());
  });

  ["dragenter", "dragover"].forEach((type) => {
    stage.addEventListener(type, (event) => {
      event.preventDefault();
      stage.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    stage.addEventListener(type, (event) => {
      event.preventDefault();
      stage.classList.remove("drag-over");
    });
  });

  stage.addEventListener("drop", (event) => {
    loadImageFile([...event.dataTransfer.files].find((file) => file.type.startsWith("image/")));
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!backgroundImage) return;
    openTextEditor(getPoint(event));
  });

  textEditor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideTextEditor();
      render();
    }
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      commitTextEditor();
    }
  });

  textDoneButton.addEventListener("click", commitTextEditor);
  textCancelButton.addEventListener("click", () => {
    hideTextEditor(false);
    setTool("select");
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.target === textEditor || event.target.matches("input, textarea")) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "v") setTool("select");
    if (key === "1") setTool("pin");
    if (key === "o") setTool("circle");
    if (key === "b") setTool("box");
    if (key === "l") setTool("line");
  });

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  clearButton.addEventListener("click", clearAnnotations);
  deleteButton.addEventListener("click", deleteSelected);
  copyButton.addEventListener("click", copyBoard);
  zoomOutButton.addEventListener("click", () => applyViewScale(viewScale - 0.1));
  zoomInButton.addEventListener("click", () => applyViewScale(viewScale + 0.1));
  zoomFitAllButton.addEventListener("click", () => fitCanvasToViewport("all"));
  zoomFitWidthButton.addEventListener("click", () => fitCanvasToViewport("width"));
  zoomActualButton.addEventListener("click", () => applyViewScale(1, "actual"));
  window.addEventListener("resize", () => fitCanvasToViewport());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  setTool("pin");
  updateActions();
})();

