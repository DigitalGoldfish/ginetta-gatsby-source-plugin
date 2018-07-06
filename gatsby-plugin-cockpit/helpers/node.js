const { singular } = require('pluralize');
const crypto = require('crypto');
const validUrl = require('valid-url');

module.exports = class CreateNodesHelpers {
  constructor({
    collectionsItems,
    regionsItems,
    store,
    cache,
    createNode,
    assetsMap,
    config,
  }) {
    this.collectionsItems = collectionsItems;
    this.regionsItems = regionsItems;
    this.store = store;
    this.cache = cache;
    this.createNode = createNode;
    this.assetsMap = assetsMap;
    this.config = config;

    const fileLocation = this.getFileAsset(this.config.placeholderImage);

    this.placeHolderImage = {
      _isset: false,
      path: "",
      localFile___NODE: fileLocation
    };

    this.placeHolderAsset = {
      _isset: false,
      path: "",
      localFile___NODE: fileLocation,
      title: "",
      mime: "",
      description: "",
      size: "",
      image: false,
      video: false,
      audio: false,
      archive: false,
      document: false,
      code: false,
      created: 0,
      modified: 0,
      _by: 'someone',
      _id: 'someid',
    };
  }

  async createItemsNodes() {
    Promise.all(      
      this.collectionsItems.map(({ fields, entries, name }) => {
        
        const nodes = entries.map(entry =>
          this.createCollectionItemNode({
            entry,
            name,
            fields,
          })
        );

        return { name, nodes, fields };
      }),
      this.regionsItems.map( ({ fields, entries, name }) => {

        const nodes = entries.map(entry =>
          this.createRegionItemNode({
            entry,
          name,
            fields,
          })
        );

        return { name, nodes, fields };
      })
    );
  }

  getImageFields(fields) {
    return Object.keys(fields).filter(
      fieldname => fields[fieldname].type === 'image'
    );
  }

  getAssetFields(fields) {
    return Object.keys(fields).filter(
      fieldname => fields[fieldname].type === 'asset'
    );
  }  

  getCollectionLinkFields(fields) {
    return Object.keys(fields).filter(
      fieldname => fields[fieldname].type === 'collectionlink'
    );
  }  

  getLayoutFields(fields) {
    return Object.keys(fields).filter(
      fieldname => fields[fieldname].type === 'layout'
    );
  }

  getRepeaterFields(fields) {
    return Object.keys(fields).filter(
      fieldname => fields[fieldname].type === 'repeater'
    );
  }

  getOtherFields(fields) {
    return Object.keys(fields).filter(
      fieldname => !['image', 'asset', 'collectionlink', 'repeater'].includes(fields[fieldname].type)
    );
  }

  composeEntryImageFields(assetFields, entry) {
    return this.composeEntryAssetFieldsHelper(assetFields, entry, this.placeHolderImage);
  }

  composeEntryRepeaterFields(repeaterFields, entry) {
    return repeaterFields.reduce((acc, fieldname) => {
      if (typeof entry[fieldname] === "undefined"
        || entry[fieldname] === null
        || entry[fieldname].path == null)
      {
        entry[fieldname] = [];
      }

      const newAcc = {
        ...acc,
        [fieldname]: entry[fieldname],
      };
      return newAcc;
    }, {});
  }

  composeEntryAssetFields(assetFields, entry) {
    return this.composeEntryAssetFieldsHelper(assetFields, entry, this.placeHolderAsset);
  }

  // map the entry image fields to link to the asset node
  // the important part is the `___NODE`.
  composeEntryAssetFieldsHelper(assetFields, entry, defaultValue) {
    return assetFields.reduce((acc, fieldname) => {
      if (typeof entry[fieldname] === "undefined"
        || entry[fieldname] === null
        || entry[fieldname].path == null)
      {
        entry[fieldname] = defaultValue;
      } else {
        entry[fieldname]._isset = true;
        let fileLocation = this.getFileAsset(entry[fieldname].path);
        entry[fieldname].localFile___NODE = fileLocation;
      }

      const newAcc = {
        ...acc,
        [fieldname]: entry[fieldname],
      };
      return newAcc;
    }, {});
  }

  // map the entry CollectionLink fields to link to the asset node
  // the important part is the `___NODE`.
  composeEntryCollectionLinkFields(collectionLinkFields, entry) {
    return collectionLinkFields.reduce((acc, fieldname) => {

      const key = fieldname + '___NODE';
      const newAcc = {
        ...acc,
        [key]: entry[fieldname]._id,
      };
      return newAcc;
    }, {});
  }  

  async parseWysiwygField(field) {
    const srcRegex = /src\s*=\s*"(.+?)"/gi;
    let imageSources;
    try {
      imageSources = field
        .match(srcRegex)
        .map(src => src.substr(5).slice(0, -1));
    } catch (error) {
      return {
        images: [],
        wysiwygImagesMap: [],
        imageSources: [],
      };
    }

    const validImageUrls = imageSources.map(
      src => (validUrl.isUri(src) ? src : this.config.host + src)
    );

    const wysiwygImagesPromises = validImageUrls.map(url =>
      createRemoteAssetByPath(url, this.store, this.cache, this.createNode)
    );

    const imagesFulfilled = await Promise.all(wysiwygImagesPromises);

    const images = imagesFulfilled.map(({ contentDigest, ext, name }) => ({
      contentDigest,
      ext,
      name,
    }));

    const wysiwygImagesMap = await createAssetsMap(imagesFulfilled);

    return {
      images,
      wysiwygImagesMap,
      imageSources,
    };
  }

  getFileAsset(path) {
    let fileLocation;

    Object.keys(this.assetsMap).forEach(key => {
      if (key.includes(path)) {
        fileLocation = this.assetsMap[key];
      }
    });

    return fileLocation;
  }

  getLayoutSettingFileLocation(setting) {
    let fileLocation;
    let assets = [];

    // if setting.path exists it is an images
    if(setting !== null && setting.path !== undefined) {
      fileLocation = this.getFileAsset(setting.path);
      if(fileLocation) {
        assets.push(fileLocation);
        setting.localFileId = fileLocation;
      }                
    }
    // if setting[0].path exists it is an array of images
    else if (setting !== null && typeof setting === 'object' && setting[0] != undefined && setting[0].path !== undefined) {
      Object.keys(setting).forEach( imageKey => {
        const image = setting[imageKey];
          
        fileLocation = this.getFileAsset(image.path);
        if(fileLocation) {
          image.localFileId = fileLocation;
          assets.push(fileLocation);
        }          

        setting[imageKey] = image;
      })
    }

    return { setting, assets };
  }

  // look into Cockpit CP_LAYOUT_COMPONENTS for image and images.
  parseCustomComponent( node, fieldname ) {
    const { settings } = node;
    const nodeAssets = [];

    Object.keys(settings).map( (key, index) => {
      
      const { setting, assets } = this.getLayoutSettingFileLocation(settings[key]);
      settings[key] = setting;
      assets.map(asset => nodeAssets.push(asset));
    })
    node.settings = settings;

    // filter duplicate assets
    const seenAssets = {};
    const distinctAssets = nodeAssets.filter( asset => {
      const seen = seenAssets[asset] !== undefined;
      seenAssets[asset] = true;
      return !seen;
    })

    return {
      node,
      nodeAssets: distinctAssets,
    };
  }

  parseLayout(layout, fieldname, isColumn = false) {
    let layoutAssets = [];

    const parsedLayout = layout.map(node => {
      if (node.component === 'text' || node.component === 'html') {
        this.parseWysiwygField(node.settings.text || node.settings.html).then(
          ({ wysiwygImagesMap, imageSources, images }) => {
            Object.entries(wysiwygImagesMap).forEach(([key, value], index) => {
              const { name, ext, contentDigest } = images[index];
              const newUrl = '/static/' + name + '-' + contentDigest + ext;
              if (node.settings.text) {
                node.settings.text = node.settings.text.replace(
                  imageSources[index],
                  newUrl
                );
              }
              if (node.settings.html) {
                node.settings.html = node.settings.html.replace(
                  imageSources[index],
                  newUrl
                );
              }
            });
          }
        );
      }

      // parse Cockpit Custom Components (defined in plugin config in /gatsby-config.js)
      if(this.config.customComponents.includes(node.component)) {
        const {node: customNode, nodeAssets: customComponentAssets } = this.parseCustomComponent(node, fieldname);
        
        node = customNode;
        layoutAssets = layoutAssets.concat(customComponentAssets);  
      }

      if (node.children) {
        if (!isColumn) {
          console.log('component: ', node.component);
        } else {
          console.log('column');
        }
        
        const {parsedLayout: childrenLayout, layoutAssets: childrenAssets } = this.parseLayout(node.children, fieldname);
        node.children = childrenLayout;
        layoutAssets = layoutAssets.concat(childrenAssets);
      }
      if (node.columns) {
        const {parsedLayout: columnsLayout, layoutAssets: columnsAssets } = this.parseLayout(node.columns, fieldname, true);
        node.columns = childrenLayout;
        layoutAssets = layoutAssets.concat(columnsAssets);        
      }

      return node;
    });

    
    return {
      parsedLayout,
      layoutAssets,
    };
  }

  composeEntryLayoutFields(layoutFields, entry) {

    return layoutFields.reduce((acc, fieldname) => {
      if( entry[fieldname] == null) return;
      if(typeof entry[fieldname] === 'string')entry[fieldname] = eval('(' + entry[fieldname] + ')');
      
      if (entry[fieldname].length === 0) {
        return acc;
      }
      const {parsedLayout, layoutAssets} = this.parseLayout(entry[fieldname], fieldname);      
      
      if(layoutAssets.length > 0) {
        const key = fieldname + '_files___NODE';
        if(acc[key] !== undefined)acc[key] = acc[key].concat(layoutAssets);
        else acc[key] = layoutAssets;
      }

      return acc;

    }, {});
  }

  composeEntryWithOtherFields(otherFields, entry) {
    return otherFields.reduce(
      (acc, fieldname) => {
        return {
        ...acc,
          [fieldname]: (typeof entry[fieldname] !== "undefined" && entry[fieldname] !== null)
            ? entry[fieldname]
            : this.config.placeholderValue,
        }
      },
      {}
    );
  }

  processFields(fields, data) {
    return Object.keys(fields).reduce((acc, currentFieldname) => {
      acc[currentFieldname] = this.processField(fields[currentFieldname], data[currentFieldname]) ;
      return acc;
    }, {});
  }

  processField(field, data) {
    const fieldType = field.type;
    switch (fieldType) {
      case "text": case "textarea":
        // TODO: check & strip html
        return this.processSimpleField(field, data, this.config.placeholderValue);
      case "wysiwyg": case "html":
        // TODO: parse html and extract images
        return this.processSimpleField(field, data, this.config.placeholderValue);
      case "markdown":
        return this.processSimpleField(field, data, this.config.placeholderValue);
      case "color": case "colortag": case "rating": case "date": case "time":
      case "code": case "password": case "select":
        return this.processSimpleField(field, data, this.config.placeholderValue);
      case "multipleselect": case "tags":
        return this.processSimpleField(field, data, this.config.placeholderValueEmptyArray);
      case "boolean":
        return this.processSimpleField(field, data, false);
      case "object":
        return this.processSimpleField(field, data, JSON.stringify({}));
      case "image":
        return this.processImageField(field, data);
      case "gallery":
        return this.processGalleryField(field, data);
      case "asset":
        return this.processAssetField(field, data);
      case "file":
        return this.processFileField(field, data);
      case "location":
        return this.processLocationField(field, data);
      case "collectionlink":
        return this.processCollectionLinkField(field, data);
      case "repeater":
        return this.processRepeaterField(field, data);
      case "set":
        return this.processSetField(field, data);
      default:
        console.error("\nUnhandled field type " + fieldType);
    }
  }

  processSimpleField(field, data, defaultValue) {
    return (typeof data !== "undefined"
        && data !== null
        && !(Array.isArray(data) && data.length === 0)
    )
      ? data
      : defaultValue;
  }

  processLocationField(field, data) {
    return (typeof data !== "undefined"
      && data !== null
    )
      ? data
      : { lat: 360, lng: 360};
  }

  processCollectionLinkField(field, data) {
    const key = fieldname + '___NODE';
    const newAcc = {
      ...acc,
      [key]: entry[fieldname]._id,
    };
    return newAcc;
  }

  processGalleryField(field, data) {
    if (typeof data !== "undefined"
      && data !== null
      && Array.isArray(data) && data.length > 0)
    {
      return data.map((image) => {
        let fileLocation = this.getFileAsset(image.path);
        // ToDo: Correctly extend meta
        return {
          ...image,
          localFile___NODE: fileLocation
        }
      });
    }

    return [{
      meta: {
        title: ''
      },
      ...this.placeHolderImage
    }];
  }

  processImageField(field, data) {

    if (typeof data === "undefined" || data === null || data.path == null) {
      return this.placeHolderImage;
    }

    let fileLocation = this.getFileAsset(data.path);

    data._isset = true;
    data.localFile___NODE = fileLocation;
    return data;
  }

  processFileField(field, data) {
    if (typeof data === "undefined" || data === null) {
      return this.placeHolderImage;
    }

    let fileLocation = this.getFileAsset(data);

    return {
      _isset: true,
      path: data,
      localFile___NODE: fileLocation
    };
  }

  processSetField(field, data) {
    const fields = field.options.fields.reduce((acc, currentValue) => {
      acc[currentValue.name] = currentValue;
      return acc;
    }, {});
    if (typeof data !== "undefined" && data !== null) {
    return this.processFields(fields, data);
  }
    return this.processFields(fields, {});
  }

  processRepeaterField(field, data) {
    if (typeof data !== "undefined" && data !== null
      && Array.isArray(data) && data.length > 0) {
      const result =  data.map(({ field, value}) => {
        return {
          [field.name]: this.processField(field, value)
        };
      });
      return result;
    }
    return [{
      _isset: false,
      [field.name]: this.processField(field.options.field, {})
    }];

  }

  processAssetField(field, data) {
    if (typeof data === "undefined" || data === null || data.path == null) {
      return this.placeHolderAsset;
    }

    let fileLocation = this.getFileAsset(data.path);

    data._isset = true;
    data.localFile___NODE = fileLocation;
    return data;
  }

  createCollectionItemNode({ entry, fields, name }) {
    return this.createItemNodeNew(
      { entry, fields, name},
      entry._id,
      singular(name)
    );
  }

  createRegionItemNode({ entry, fields, name}) {
    return this.createItemNodeNew(
      { entry, fields, name},
      `region-${name}`,
      `region${name}`
    );
  }

  createItemNodeNew({ entry, fields, name }, id, type) {

    const nodeData = this.processFields(fields, entry);
    const node = {
      ...nodeData,
      id: id,
      children: [],
      parent: null,
      internal: {
        type: type,
        contentDigest: crypto
          .createHash(`md5`)
          .update(JSON.stringify(entry))
          .digest(`hex`),
      },
    };
    this.createNode(node);
    return node;
  }

  createItemNode({ entry, fields, name }, id, type) {

    //1
    const imageFields = this.getImageFields(fields);
    const assetFields = this.getAssetFields(fields);
    const layoutFields = this.getLayoutFields(fields);
    const collectionLinkFields = this.getCollectionLinkFields(fields);
    const repeaterFields = this.getRepeaterFields(fields);
    const otherFields = this.getOtherFields(fields);
    //2
    const entryImageFields = this.composeEntryImageFields(imageFields, entry);
    const entryAssetFields = this.composeEntryAssetFields(assetFields, entry);
    const entryCollectionLinkFields = this.composeEntryCollectionLinkFields(collectionLinkFields, entry);
    const entryRepeaterFields = this.composeEntryRepeaterFields(repeaterFields, entry);
    const entryLayoutFields = this.composeEntryLayoutFields(
      layoutFields,
      entry
    );
    const entryWithOtherFields = this.composeEntryWithOtherFields(
      otherFields,
      entry
    );

    //3
    const node = {
      ...entryWithOtherFields,
      ...entryImageFields,
      ...entryAssetFields,
      ...entryCollectionLinkFields,
      ...entryRepeaterFields,
      ...entryLayoutFields,
      id: id,
      children: [],
      parent: null,
      internal: {
        type: type,
        contentDigest: crypto
          .createHash(`md5`)
          .update(JSON.stringify(entry))
          .digest(`hex`),
      },
    };
    this.createNode(node);
    return node;
  }

}