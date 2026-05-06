/* global module */

module.exports = function transform(fileInfo) {
  const source = fileInfo.source;
  return source
    .replaceAll('submitEsocialEvent(', 'esocialClient.submit(')
    .replaceAll('consultEsocialStatus(', 'esocialClient.consultStatus(');
};
