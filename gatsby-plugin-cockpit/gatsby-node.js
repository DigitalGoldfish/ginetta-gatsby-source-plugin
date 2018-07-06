const CockpitSDK = require('cockpit-sdk').default;
const { AssetMapHelpers, CockpitHelpers, CreateNodesHelpers } = require('./helpers');
const extendNodeType = require('./extend-node-type');

exports.sourceNodes = async ({
  boundActionCreators: { createNode },
  store,
  cache,
}, pluginOptions) => {
  const defaultConfig = {
    baseURL: '',
    folder: '',
    accessToken: '',
    sanitizeHtmlConfig: {},    
    customComponents: [],
    placeholderImage: 'https://via.placeholder.com/1x1',
    placeholderValue: '_cockpitisnotset_',
    placeholderValueEmptyArray: "[]",
  };
  
  const config = Object.assign(defaultConfig, pluginOptions.cockpitConfig);
  const host = config.baseURL + config.folder;

  const cockpit = new CockpitSDK({
    host,
    accessToken: config.accessToken,
  });

  const cockpitHelpers = new CockpitHelpers(cockpit, config);
  const collectionNames = await cockpitHelpers.getCollectionNames();

  const [{ assets }, collectionsItems, regionsItems] = await Promise.all([
    cockpit.assets(), 
    cockpitHelpers.getCockpitCollections(),
    cockpitHelpers.getCockpitRegions(),
  ]);

  assets.forEach((asset) => {
    asset.path = host + '/storage/uploads' + asset.path;
  });

  exports.collectionsItems = collectionsItems;
  exports.regionsItems = regionsItems;
  exports.collectionsNames = collectionNames;
 
  const assetMapHelpers = new AssetMapHelpers({
    assets,
    store,
    cache,
    createNode,
    collectionsItems,
    regionsItems,
    config,
  });

  const assetsMap = await assetMapHelpers.createAssetsNodes();

  const createNodesHelpers = new CreateNodesHelpers({
    collectionsItems,
    regionsItems,
    store,
    cache,
    createNode,
    assetsMap,
    config,
  });

  await createNodesHelpers.createItemsNodes();
};

exports.setFieldsOnGraphQLNodeType = extendNodeType;