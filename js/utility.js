class Utility {
  generateKeyCounter = -1;
  cAlpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  cNumeric = '0123456789';
  cAlphaNumeric = this.cAlpha + this.cNumeric;

  generateRandomAlphanumeric(length) {
    let result = '';
    const charactersLength = this.cAlphaNumeric.length;
    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += this.cAlphaNumeric.charAt(array[i] % charactersLength);
    }
    return result;
  }
  generateRandomAlpha(length) {
    let result = '';
    const charactersLength = this.cAlpha.length;
    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += this.cAlpha.charAt(array[i] % charactersLength);
    }
    return result;
  }

  key() {
    this.generateKeyCounter++;
    const timestamp = Date.now();
    const randomAbc = this.generateRandomAlpha(4);
    const randomPart = this.generateRandomAlphanumeric(8);
    return `${randomAbc}${randomPart}${timestamp}${this.generateKeyCounter}`;
  }
  address() {
    let address = '0x';
    for (let i = 0; i < 9; i++) {
      let byte = Math.floor(Math.random() * 256).toString(16);
      if (byte.length < 2) byte = '0' + byte;
      address += byte;
    }
    address += (Date.now()).toString(16);
    return address;
  }

  formatSecondsToHour(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = parseInt(totalSeconds % 60);
    return `${hours > 0 ? `${hours < 10 ? '0' : ''}${hours}:` : ''}${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  getInitials(name) {
    const words = name.split(' ');
    const filteredWords = words.filter(word => word.length > 0);
    const initials = filteredWords.slice(0, 2).map(word => word[0].toUpperCase()).join('');
    return initials;
  }
  addRow = (config, content = null) => {
    let item = null;
    switch (config.type) {
      case 'text':
        item = cms.view.addInput({
          name: config.name,
          placeholder: config.label,
          class: 'cms-w-100',
          inputAttr: {
            autocomplete: 'off',
            spellcheck: 'false'
          }
        });
        config.input = item.input;
        break;
      case 'int':
        item = cms.view.addInput({
          name: config.name,
          placeholder: config.label,
          class: 'cms-w-100',
          inputAttr: {
            autocomplete: 'off',
            spellcheck: 'false',
            type: 'number'
          }
        });
        config.input = item.input;
        break;
      case 'textarea':
        item = _.textarea({
          class: 'item-textarea cms-w-100',
          placeholder: config.label,
          rows: 5
        });
        config.input = item;
        break;
      case 'select':
        item = cms.view.addSelect({
          name: config.name,
          placeholder: config.label,
          class: 'cms-w-100',
          options: config.options,
          maxHeight: config.maxHeight ?? null,
          inputAttr: {
            autocomplete: 'off',
            spellcheck: 'false'
          }
        });
        config.input = item._value;
        break;
      default:
        item = _.input(config);
        break;
    }
    if (content) {
      content.appendChild(_.div({ class: 'cms-m-10' }, item));
    }
    return item;
  }
  findKeyWidget(key) {
    return new Promise((resolve, reject) => {
      try {
        tlConfig.CATEGORIES.forEach(category => {
          const widget = category.widgets.find(widget => widget.key === key);
          if (widget) {
            widget.category = category.category;
            return resolve(widget);
          }
        });
        return resolve(null);
      } catch (error) {
        return reject(error);
      }

    });

  }
}