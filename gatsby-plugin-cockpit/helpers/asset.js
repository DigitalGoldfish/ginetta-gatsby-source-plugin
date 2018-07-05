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

  addAllOtherImagesPathsToAssetsArray() {
    this.collectionsItems.map(this.extractAssetPaths.bind(this));
    this.regionsItems.map(this.extractAssetPaths.bind(this));
  }

  // gets all assets and adds them as file nodes
  // returns a map of url => node id
  async createAssetsNodes() {

    // add default placeholder image to assets map
    this.assets.push({
      path: this.config.placeholderImage
    });

    this.addAllOtherImagesPathsToAssetsArray();

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