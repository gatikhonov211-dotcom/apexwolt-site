// Поиск организации по ИНН через DaData («Организация по ИНН или ОГРН», findById/party).
// Токен — только на сервере (ENV DADATA_TOKEN), в браузер не передаётся.
const ENDPOINT = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';

const STATUS = {
  ACTIVE: 'действующая',
  LIQUIDATING: 'ликвидируется',
  LIQUIDATED: 'ликвидирована',
  BANKRUPT: 'банкротство',
  REORGANIZING: 'в процессе реорганизации'
};

// Ответ DaData → компактная карточка для формы регистрации. Без лишних персональных данных.
export function mapParty(suggestion) {
  const d = suggestion?.data || {};
  return {
    inn: d.inn || '',
    kpp: d.kpp || '',
    ogrn: d.ogrn || '',
    type: d.type === 'INDIVIDUAL' ? 'ИП' : 'Организация',
    name: d.name?.short_with_opf || suggestion?.value || '',
    fullName: d.name?.full_with_opf || '',
    address: d.address?.unrestricted_value || d.address?.value || '',
    status: d.state?.status || '',
    statusText: STATUS[d.state?.status] || '',
    active: !d.state?.status || d.state.status === 'ACTIVE'
  };
}

export async function findPartyByInn(inn, token, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ query: inn, count: 1 })
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('DaData: неверный токен или нет доступа'), { code: 'auth' });
  if (res.status === 429) throw Object.assign(new Error('DaData: превышен лимит запросов'), { code: 'limit' });
  if (!res.ok) throw Object.assign(new Error(`DaData: ошибка ${res.status}`), { code: 'upstream' });
  const json = await res.json();
  const first = json?.suggestions?.[0];
  return first ? mapParty(first) : null;
}

// Тестовый режим без токена (DADATA_MOCK=1): реквизиты ООО «Гранит» из карточки предприятия.
export const MOCK_PARTIES = {
  '3817050540': {
    inn: '3817050540', kpp: '381701001', ogrn: '1203800007850', type: 'Организация',
    name: 'ООО «ГРАНИТ»', fullName: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «ГРАНИТ»',
    address: '665717, Иркутская обл., г. Братск, Центральный жилрайон, ул. Южная, д. 14Б',
    status: 'ACTIVE', statusText: 'действующая', active: true
  }
};
