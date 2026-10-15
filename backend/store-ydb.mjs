// Хранение заявок в YDB (Yandex Cloud, данные в РФ). Включается, когда заданы YDB_ENDPOINT и YDB_DATABASE.
// Доступ: в функции — YDB_METADATA_CREDENTIALS=1 (сервисный аккаунт), локально — YDB_ACCESS_TOKEN_CREDENTIALS=<IAM-токен>.
// Таблица создаётся при первом обращении: registrations(id, inn, status, created_at, data) + индекс по ИНН.
import ydb from 'ydb-sdk';

const { Driver, getCredentialsFromEnv, TypedValues, Types, TableDescription, TableIndex, Column } = ydb;
const TABLE = 'registrations';

let driverPromise;
let tableReady;

async function getDriver() {
  driverPromise ||= (async () => {
    const driver = new Driver({
      endpoint: process.env.YDB_ENDPOINT,
      database: process.env.YDB_DATABASE,
      authService: getCredentialsFromEnv()
    });
    if (!(await driver.ready(10_000))) throw new Error('YDB недоступна');
    return driver;
  })().catch(e => { driverPromise = null; throw e; });
  return driverPromise;
}

async function withSession(fn) {
  const driver = await getDriver();
  tableReady ||= driver.tableClient.withSession(async session => {
    try { await session.describeTable(TABLE); }
    catch {
      await session.createTable(TABLE, new TableDescription()
        .withColumn(new Column('id', Types.optional(Types.UTF8)))
        .withColumn(new Column('inn', Types.optional(Types.UTF8)))
        .withColumn(new Column('status', Types.optional(Types.UTF8)))
        .withColumn(new Column('created_at', Types.optional(Types.TIMESTAMP)))
        .withColumn(new Column('data', Types.optional(Types.UTF8)))
        .withPrimaryKey('id')
        .withIndex(new TableIndex('idx_inn').withIndexColumns('inn')));
    }
  }).catch(e => { tableReady = null; throw e; });
  await tableReady;
  return driver.tableClient.withSession(fn);
}

export async function findRegistrationByInn(inn) {
  return withSession(async session => {
    const { resultSets } = await session.executeQuery(`
      DECLARE $inn AS Utf8;
      SELECT data FROM ${TABLE} VIEW idx_inn WHERE inn = $inn AND status != "rejected" LIMIT 1;`,
    { $inn: TypedValues.utf8(inn) });
    const row = resultSets[0]?.rows?.[0];
    return row ? JSON.parse(row.items[0].textValue) : null;
  });
}

export async function saveRegistration(record) {
  await withSession(session => session.executeQuery(`
    DECLARE $id AS Utf8; DECLARE $inn AS Utf8; DECLARE $status AS Utf8;
    DECLARE $created AS Timestamp; DECLARE $data AS Utf8;
    UPSERT INTO ${TABLE} (id, inn, status, created_at, data) VALUES ($id, $inn, $status, $created, $data);`,
  {
    $id: TypedValues.utf8(record.id),
    $inn: TypedValues.utf8(record.company.inn),
    $status: TypedValues.utf8(record.status),
    $created: TypedValues.timestamp(new Date(record.createdAt)),
    $data: TypedValues.utf8(JSON.stringify(record))
  }));
  return record;
}
