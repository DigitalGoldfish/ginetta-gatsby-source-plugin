const { createRemoteFileNode } = require(`gatsby-source-filesystem`);
const validUrl = require('valid-url');

async function createRemoteAssetByPath(url, store, cache, createNode) {
  const { id, internal, ext, name } = await createRemoteFileNode({
    url,
    store,
    cache,
    createNode,
  });
  return {
    url,
    id,
    ext,
    name,
    contentDigest: internal.contentDigest,
  };
}

async function createAssetsMap(assetPromises) {
  const allResults = await Promise.all(assetPromises);
  return allResults.reduce(
    (acc, { url, id }) => ({
      ...acc,
      [url]: id,
    }),
    {}
  );
}

class AssetMapHelpers {
  constructor({ assets, store, cache, createNode, collectionsItems, regionsItems, config }) {
    this.assets = assets;
    this.store = store;
    this.cache = cache;
    this.createNode = createNode;
    this.collectionsItems = collectionsItems;
    this.regionsItems = regionsItems;
    this.config = config;
    this.config.host = config.baseURL + config.folder;
  }

  extractAssetPaths({ entries, fields }) {
      const imageFields = Object.keys(fields).filter(
        fieldname => fields[fieldname].type === 'image'
      );
      imageFields.forEach(fieldname => {
        entries.forEach(entry => {
          if (typeof entry[fieldname] === "undefined") {
            return;
          } else if (entry[fieldname].path) {
            let path = entry[fieldname].path;
            if (!validUrl.isUri(path)) {
              path = this.config.host + '/' + path;
            }
            if (validUrl.isUri(path)) {
              this.assets.push({
                path,
              });
            } else {
              throw new Error(
                'The path of an image seems to be malformed -> ',
                path
              );
            }
          }
        });
      });
  }

  extractAssetPathsNew({ entries, fields }) {
    entries.forEach(entry => {
      this.processFields(fields, entry);
    });
  }

  processFields(fields, data) {
    Object.keys(fields).forEach((fieldName) => {
      this.processField(fields[fieldName], data[fieldName])
    });
  }

  processField(field, data) {
    if (typeof data === "undefined"
      || data === null)
    {
      return;
    }
    const fieldType = field.type;
    switch(fieldType) {
      case "image":
        if (typeof data.path === "undefined" ||data.path === null || data.path === "") {
          return;
        }
        this.addAsset(data.path);
        break;
      case "file":
        if (typeof data === "undefined" || data === null) {
          return;
        }
        this.addAsset(data);
        break;
      case "repeater":
        if (typeof data === "undefined" || data === null || !Array.isArray(data) || data.length === 0) {
          return;
        }

        data.forEach(({ field, value }) => {
          if (typeof value === "undefined" || value === null) {
            return;
          }
          this.processField(field, value);
        });
        break;
      case "set":
        if (typeof data === "undefined" || data === null) {
          return;
        }
        const fields = field.options.fields.reduce((acc, currentValue) => {
          acc[currentValue.name] = currentValue;
          return acc;
        }, {});

        this.processFields(fields, data);
        break;
      case "gallery":
        if (typeof data === "undefined" || data === null || !Array.isArray(data) || data.length === 0) {
          return;
        }
        data.forEach((galleryImage) => {
          if (typeof galleryImage === "undefined" || galleryImage === null || galleryImage.path === "") {
            return;
          }
          this.addAsset(galleryImage.path);
        });
        break;
      case "markdown":
        // TODO: extract image URLs from markdown source code
        break;
      case "html": case "wysiwyg": case "code":
        // TODO: extract image URLs from html source code
        break;
      default:
        // do nothing
    }

    /*
    if (entry[fieldname].path) {
      let path = entry[fieldname].path;
      if (!validUrl.isUri(path)) {
        path = this.config.host + '/' + path;
      }
      if (validUrl.isUri(path)) {
        this.assets.push({
          path,
        });
      } else {
        throw new Error(
          'The path of an image seems to be malformed -> ',
          path
        );
      }
    }*/
  }

  addAsset(path) {
    if (!validUrl.isUri(path)) {
      path = this.config.host + '/' + path;
    }
    if (validUrl.isUri(path)) {
      this.assets.push({
        path,
      });
    } else {
      throw new Error(
        'The path of an image seems to be malformed -> ',
        path
      );
    }
  }

  addAllOtherImagesPathsToAssetsArray() {
    this.collectionsItems.map(this.extractAssetPaths.bind(this));
    this.regionsItems.map(this.extractAssetPaths.bind(this));
  }

  addAllOtherImagesPathsToAssetsArrayNew() {
    this.collectionsItems.map(this.extractAssetPathsNew.bind(this));
    this.regionsItems.map(this.extractAssetPathsNew.bind(this));
  }

  // gets all assets and adds them as file nodes
  // returns a map of url => node id
  async createAssetsNodes() {

    // add default placeholder image to assets map
    this.assets.push({
      path: this.config.placeholderImage
    });

    this.addAllOtherImagesPathsToAssetsArrayNew();

    const allRemoteAssetsPromises = this.assets.map(asset =>
      createRemoteAssetByPath(
        asset.path,
        this.store,
        this.cache,
        this.createNode
      )
    );

    const finalAssetsMap = await createAssetsMap(allRemoteAssetsPromises);
    return finalAssetsMap;
  }
}

module.exports = {
  AssetMapHelpers,
  createAssetsMap,
};