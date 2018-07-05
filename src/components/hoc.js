const React = require('react');

const clean = value => {
  if (isArray(value)) {
    return traverseArray(value);
  } else if ((typeof value === 'object') && (value !== null)) {
    return traverseObject(value);
  } else {
    return value === '_cockpitisnotset_' ? null : value;
  }
};

const traverseArray = (arr) => {
  const newArr = [];
  arr.forEach(function(x) {
    newArr.push(clean(x));
  });
  return newArr.filter((value) => {
    return value != null;
  });
};

function traverseObject (obj) {
  if (typeof obj._isset !== 'undefined' && !obj._isset) {
    return null;
  }
  const newObj = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      newObj[key] = clean(obj[key]);
    }
  }
  return newObj;
}

function isArray(o) {
  return Object.prototype.toString.call(o) === '[object Array]';
}

const postProcessCockpitData = (BaseComponent) => (baseProps) => {
  const transformedProps = {
    ...baseProps,
    data: clean(baseProps.data),
  };
  return <BaseComponent {...transformedProps} />;
};

export default postProcessCockpitData;