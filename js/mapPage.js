class MapPage {
  point = {
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
    elementMove: null,
    direction: null,
    minCol: 1,
    maxCol: 48,
    minRow: 1,
    maxRow: null,
    block: null,
    content: null,
  };
  constructor(config) {
    this.columns = config?.columns ?? 48;
    this.rows = config?.rows ?? 40;
    this.content = _.div({ class: 'content-edit' });
    document.body.appendChild(this.content);
    this.listBlocks = {};
    this.elementDragEnter = null;
    this.mount();
  }
  mount() {
    const rect = this.content.getBoundingClientRect();
    this.content.style.setProperty('--item-divisor', (rect.width / this.columns) + 'px');

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        const itemId = `${r}-${c}`;
        const block = _.div({ class: 'item-divisor' });
        block.ondragover = (e) => {
          e.stopPropagation();
          e.preventDefault();
        };
        block.ondragenter = (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.elementDragEnter = block;
          this.elementDragEnter.pos = { row: r, col: c };
        };

        this.listBlocks[itemId] = {
          element: block,
          posRow: r,
          posCol: c,
        };
        this.content.appendChild(block);
      }
    }
  }

  startListener = () => {
    document.addEventListener('mousemove', (e) => {
      if (this.point.elementMove) {
        this.point.posX = e.clientX - this.point.startX
        this.point.posY = e.clientY - this.point.startY
        switch (this.point.direction) {
          case 'top':
            this.point.elementMove.style.setProperty('--item-val', (this.point.posY - 5) + 'px');
            break;
          case 'right':
            this.point.elementMove.style.setProperty('--item-val', (-this.point.posX - 5) + 'px');
            break;
          case 'bottom':
            this.point.elementMove.style.setProperty('--item-val', (-this.point.posY - 5) + 'px');
            break;
          case 'left':
            this.point.elementMove.style.setProperty('--item-val', (this.point.posX - 5) + 'px');
            break;
        }
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (!this.point.elementMove) {
        return;
      }
      const divisor = parseFloat(this.content.style.getPropertyValue('--item-divisor'));
      const bc = parseFloat(this.point.content.style.getPropertyValue('--block-col')) || 1;
      const br = parseFloat(this.point.content.style.getPropertyValue('--block-row')) || 1;
      const vx = Math.round(this.point.posX / divisor);
      const vy = Math.round(this.point.posY / divisor);
      let posCol = this.point.block.posCol;
      let posRow = this.point.block.posRow;
      const minQtyBlocs = (v) => {
        const min = this.point.minBlock ?? 1;
        return v < min ? min : v;
      }
      switch (this.point.direction) {
        case 'top':
          posRow += vy;
          if (vy < 0) {
            this.point.content.style.setProperty('--block-row', minQtyBlocs(parseInt(br) + Math.abs(vy)));
          } else {
            this.point.content.style.setProperty('--block-row', minQtyBlocs(parseInt(br) - Math.abs(vy)));
          }
          break;
        case 'right':
          if (vx > 0) {
            this.point.content.style.setProperty('--block-col', minQtyBlocs(parseInt(bc) + Math.abs(vx)));
          } else {
            this.point.content.style.setProperty('--block-col', minQtyBlocs(parseInt(bc) - Math.abs(vx)));
          }
          break;
        case 'bottom':
          if (vy > 0) {
            this.point.content.style.setProperty('--block-row', minQtyBlocs(parseInt(br) + Math.abs(vy)));
          } else {
            this.point.content.style.setProperty('--block-row', minQtyBlocs(parseInt(br) - Math.abs(vy)));
          }
          break;
        case 'left':
          posCol += vx;
          if (vx < 0) {
            this.point.content.style.setProperty('--block-col', minQtyBlocs(parseInt(bc) + Math.abs(vx)));
          } else {
            this.point.content.style.setProperty('--block-col', minQtyBlocs(parseInt(bc) - Math.abs(vx)));
          }
          break;
      }
      this.point.block.posCol = posCol;
      this.point.block.posRow = posRow;
      this.listBlocks[`${posRow}-${posCol}`].element.appendChild(this.point.content);
      this.point.elementMove.attr('style', '');
      this.point.startX = 0;
      this.point.startY = 0;
      this.point.elementMove.classList.remove('active');
      this.point.elementMove = null;
      this.point.direction = null;
    });
  }

  moveWidget = (configItem) => {
    const top = _.div({ class: 'resize top' });
    const right = _.div({ class: 'resize right' });
    const bottom = _.div({ class: 'resize bottom' });
    const left = _.div({ class: 'resize left' });

    const move = _.div({ class: 'move' });

    const content = _.div({ class: 'edit-block-content' },
      move, top, right, bottom, left);
    const idPos = `${configItem.posRow}-${configItem.posCol}`;
    const block = this.listBlocks[idPos];
    block.element.appendChild(content);

    content.style.setProperty('--block-col', '1');
    content.style.setProperty('--block-row', '1');

    const startItemDrag = (item) => {
      item.draggable = true;

      /*
      item.ondragstart = function (e) {
        e.dataTransfer.setDragImage(content, e.offsetX, e.offsetY);
      };
      /**/
      item.ondragend = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.elementDragEnter.appendChild(content);
        block.posCol = this.elementDragEnter.pos.col;
        block.posRow = this.elementDragEnter.pos.row;
      };
    }

    const startResize = (item, direction) => {
      item.onmousedown = (e) => {
        item.classList.add('active');
        this.point.startX = e.clientX;
        this.point.startY = e.clientY;
        this.point.elementMove = item;
        this.point.direction = direction;
        this.point.content = content;
        this.point.block = block
      };
    }
    startResize(top, 'top');
    startResize(right, 'right');
    startResize(bottom, 'bottom');
    startResize(left, 'left');

    startItemDrag(move);
    this.startListener();
    return content;
  }
}