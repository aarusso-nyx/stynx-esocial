function queryResult(rows) {
  return { rows };
}

function mockQueryQueue(results) {
  const query = jest.fn();
  for (const result of results) {
    if (result instanceof Error) {
      query.mockRejectedValueOnce(result);
    } else if (result && typeof result === 'object' && ('rows' in result || 'rowCount' in result)) {
      query.mockResolvedValueOnce(result);
    } else {
      query.mockResolvedValueOnce(
        Array.isArray(result) ? queryResult(result) : queryResult([result]),
      );
    }
  }
  return query;
}

function mockTransactionDatabase(client) {
  return {
    configured: true,
    query: jest.fn(),
    transaction: jest.fn((fn) => fn(client)),
  };
}

module.exports = {
  mockQueryQueue,
  mockTransactionDatabase,
  queryResult,
};
