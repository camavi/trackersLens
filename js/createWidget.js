class CreateWidget {

  DB_WIDGETS = tlConfig.TABLES.TL_WIDGETS;
  manifest = tlConfig.MANIFEST;
  links = {};
  btnSave = _.button({ class: '' }, 'Save');
  tabBar = _.div({ class: 'tab-bar-content' });
  tabContent = _.div({ class: 'tab-content' });
  content = _.div({ class: 'ce-content' },
    this.tabBar, this.tabContent, _.div({ class: 'cms-t-a-right cms-p-6' }, this.btnSave)
  );
  dataSave = [];
  codeMirrorDefaultSetting = {
    lineNumbers: true,
    height: '100%',
    theme: 'darcula'
  };
  taps = [];
  editorCSS = null;
  editorJS = null;
  editorHTML = null;
  constructor(config) {
    this.config = config;
    this.utility = new Utility();
    this.key = _rod(this.utility.key());
    this.db = config.db;
    this.manifestContent();
    this.linksExternalContent();
    this.keyPage = config.keyPage;
    this.editorCSS = this.scriptContent({
      title: 'CSS',
      mode: 'css',
    });
    this.editorJS = this.scriptContent({
      title: 'JS',
      mode: 'javascript'
    });
    this.editorHTML = this.scriptContent({
      title: 'HTML',
      mode: 'htmlmixed'
    });
    this.btnSave.onclick = this.setData.bind(this);
    this.preview();
    this.public();
  }
  switchTab(tab, content) {
    Array.from(this.tabBar.qa('.btn-title')).forEach(item => {
      item.classList.remove('active');
    });
    Array.from(this.tabContent.qa('.item-content')).forEach(item => {
      item.classList.remove('active');
    });
    tab.classList.add('active');
    content.classList.add('active');
  }
  createTab(title, content, active = false) {
    const tap = _.button({ class: 'btn-title' }, title);
    this.tabBar.appendChild(tap);
    const tapContent = _.div({ class: 'item-content' }, content);
    this.tabContent.appendChild(tapContent);
    tap.onclick = () => this.switchTab(tap, tapContent);
    if (active) {
      tap.click();
    }
  }
  async open() {
    this.key.value = this.utility.key();
    this.popup = cms.popup();
    this.popup.classList.add('pc-create-container');
    this.popup.content.appendChild(this.content);
  }
  async getData(id, type) {
    let result = null;
    if (this.config.local) {
      result = localStorage.getItem(`${id}-${type}`);
    } else {
      result = await cms.fetchData({
        url: this.config.url,
        data: { id: id, type: type },
      });
    }
    return result ? JSON.parse(result) : null;
  }
  setDataSaveItem(data, dataSave) {
    data.forEach(item => {
      switch (item.type) {
        case 'text': case 'textarea': case 'select':
          dataSave[item.name] = item.input.value;
          break;
        case 'int':
          dataSave[item.name] = parseInt(item.input.value);
          break;
        case 'float':
          dataSave[item.name] = parseFloat(item.input.value);
          break;
        case 'checkbox':
          dataSave[item.name] = item.input.checked;
          break;
        case 'radio':
          dataSave[item.name] = Array.from(item.input.qa('input')).find(radio => radio.checked).value;
          break;
        case 'file':
          dataSave[item.name] = item.input.files[0];
          break;
      }
    });
  };
  async setData() {
    this.btnSave.loader = true;
    const dataSave = {};
    this.setDataSaveItem(this.manifest, dataSave);
    this.setDataSaveItem(this.dataSave, dataSave);
    dataSave.links = [];
    for (let i in this.links) {
      dataSave.links.push(this.links[i].value);
    }
    dataSave.contentCSS = this.editorCSS.getValue();
    dataSave.contentJS = this.editorJS.getValue();
    dataSave.contentHTML = this.editorHTML.getValue();

    await this.db.addData(this.DB_WIDGETS, {
      id: this.key.value,
      content: dataSave
    });
    this.btnSave.loader = false;

    return;
    if (this.config.local) {
      localStorage.setItem(`${id}-${type}`, dataSave);
    } else {
      await cms.fetchData({
        url: this.config.url,
        method: 'POST',
        data: { id: id, type: type, content: dataSave },
      });
    }

  }
  manifestContent() {
    const contentManifest = _.div({ class: 'content-manifest cms-col-10' },
      _.div({ class: 'key_temp' }, _.b('Key Temp: '), _.span({ rod: this.key }))
    );
    const contentDescription = _.div({ class: 'content-manifest-description cms-col-10' }
    );
    const contentPopup = _.div({ class: 'cms-row cms-p-10' }, contentManifest, contentDescription);
    this.createTab('Manifest', contentPopup, true);
    this.manifest.forEach(row => {
      utility.addRow(row, contentManifest);
    });

    const listOptions = [];
    tlConfig.CATEGORIES.forEach((item, n) => {
      const idCategory = `category_${n}`;
      const category = _.div({ class: 'category', id: idCategory }, item.category);
      listOptions.push(category);
      item.widgets.forEach(wid => {
        const widget = _.div({ class: 'widget', value: wid?.key, category: idCategory }, wid.name);
        listOptions.push(widget);
      });

    });

    const category = {
      label: 'Category',
      type: 'select',
      name: 'category',
      class: 'cms-w-100',
      maxHeight: '300px',
      options: listOptions,
    };
    utility.addRow(category, contentManifest);

    const devicesDesktop = {
      label: 'Desktop',
      type: 'checkbox',
      name: 'devicesDesktop',
      class: 'onoff-mini',
    };
    devicesDesktop.input = _.input(devicesDesktop);
    const devicesTablet = {
      label: 'Tablet',
      type: 'checkbox',
      name: 'devicesTablet',
      class: 'onoff-mini',
    };
    devicesTablet.input = _.input(devicesTablet);
    const devicesMobile = {
      label: 'Mobile',
      type: 'checkbox',
      name: 'devicesMobile',
      class: 'onoff-mini',
    };
    devicesMobile.input = _.input(devicesMobile);
    contentDescription.appendChild(
      _.div({ class: 'cms-row cms-m-10' },
        _.div({ class: 'cms-col-20 cms-p-10' }, "Devices supported"),
        _.div({ class: 'cms-col-20 cms-row cms-p-10' },
          _.div({ class: 'cms-col-6.66 cms-p-2' },
            _.b('Desktop: '), devicesDesktop.input
          ),
          _.div({ class: 'cms-col-6.66 cms-p-2' },
            _.b('Tablet: '), devicesTablet.input
          ),
          _.div({ class: 'cms-col-6.66 cms-p-2' },
            _.b('Mobile: '), devicesMobile.input
          )
        )
      )
    );
    const dataMinX = {
      label: 'minX',
      type: 'int',
      name: 'minX',
    };
    const dataMaxX = {
      label: 'maxX',
      type: 'int',
      name: 'maxX',
    };
    const dataMinY = {
      label: 'MinY',
      type: 'int',
      name: 'MinY',
    };
    const dataMaxY = {
      label: 'MaxY',
      type: 'int',
      name: 'MaxY',
    };
    contentDescription.appendChild(
      _.div({ class: 'cms-row cms-m-10' },
        _.div({ class: 'cms-col-20 cms-p-10' }, "Minimum and maximum blocks"),
        _.div({ class: 'cms-row cms-m-4' },
          _.div({ class: 'cms-col-10 cms-p-r-4' },
            utility.addRow(dataMinX)),
          _.div({ class: 'cms-col-10 cms-p-r-4' },
            utility.addRow(dataMaxX))
        ),
        _.div({ class: 'cms-row cms-m-4' },
          _.div({ class: 'cms-col-10 cms-p-r-4' },
            utility.addRow(dataMinY)),
          _.div({ class: 'cms-col-10 cms-p-r-4' },
            utility.addRow(dataMaxY))
        )
      )
    );
    this.dataSave.push(category, devicesDesktop, devicesTablet, devicesMobile, dataMinX, dataMaxX, dataMinY, dataMaxY);
  }

  linksExternalContent() {
    const contentLinks = _.div({ class: 'content-links cms-row' });
    const btnAddLink = _.button({ class: 'cms-btn-default' }, 'Add Link');
    const content = _.div({ class: 'content-manifest' }, contentLinks,
      _.div({ class: 'cms-t-a-center' }, btnAddLink));
    const addRow = (config) => {
      const key = this.utility.key();
      const input = cms.view.addInput({
        name: config.name,
        label: config.label ?? config.name,
        placeholder: config.placeholder,
        class: 'cms-w-100 ' + config.class,
        autocomplete: 'off',
        spellcheck: false
      });
      this.links[key] = input.input;
      const del = _.button({ class: 'cms-btn-delete' }, _.i({ class: 'cms-icon trash' }));
      const item = _.div({ class: 'cms-m-6 cms-w-100 cms-row' },
        _.div({ class: 'cms-col-19' }, input),
        _.div({ class: 'cms-col-1' }, del)
      );
      contentLinks.appendChild(item);
      del.onclick = () => {
        item.rm();
        delete this.links[key];
      };
    }
    btnAddLink.onclick = () => {
      addRow({
        name: 'link',
        placeholder: 'Link',
        type: 'text',
      });
    };
    this.createTab('External Link', content);
  }
  preview() {
    const content = _.div({ class: 'content-manifest' }, 'Preview');
    this.createTab('Preview', content);
  }
  public() {
    const content = _.div({ class: 'content-manifest' }, 'Public');
    this.createTab('Public', content);
  }
  formatCodeWithPrettify(editor, type) {
    switch (type) {
      case 'html':
        editor.setValue(html_beautify(editor.getValue()));
        return;
      case 'css':
        editor.setValue(css_beautify(editor.getValue()));
        return;
      case 'js':
        editor.setValue(js_beautify(editor.getValue()));
        return;
    }
  }
  scriptContent(config) {

    const editorContent = _.textarea({ class: 'editor' });
    const content = _.div({ class: 'content-scripts' }, editorContent);
    this.createTab(config.title, content);
    const editor = CodeMirror.fromTextArea(editorContent, {
      ...this.codeMirrorDefaultSetting,
      mode: config.mode,
    });
    editor.on("blur", formatCodeWithPrettify);

    function formatCodeWithPrettify() {
      const formattedCode = css_beautify(editor.getValue());
      editor.setValue(formattedCode);
    }

    return editor;
  }
}