import type { components } from '@/api/schema';
import { estimateOperatorText } from './estimateOperatorText';
import { publicSourceText } from '@/utils/publicSource';

type Route = NonNullable<components['schemas']['CompactState']['route']>;

export function CompactPreliminaryRouteTable({ route }: { route: Route }) {
  return <><div className="engineering-table-scroll overflow-x-auto" tabIndex={0} aria-label="Предварительный маршрут: прокручиваемая таблица"><table className="preliminary-route-table w-full text-sm"><caption className="sr-only">Предварительный маршрут</caption><thead><tr><th>№</th><th>Операция и назначение</th><th>Способ</th><th>Класс оборудования</th><th>Существенные требования</th></tr></thead><tbody>{route.operations.map((operation, index) => <tr key={index}>
    <td className="tabular-nums">{index + 1}</td><th scope="row"><p>{estimateOperatorText(operation.title)}</p><p className="mt-2 font-normal whitespace-pre-wrap">{estimateOperatorText(publicSourceText(operation.purpose, ''))}</p></th><td className="whitespace-pre-wrap">{estimateOperatorText(publicSourceText(operation.method, '')) || 'Не определён'}</td><td className="whitespace-pre-wrap">{estimateOperatorText(publicSourceText(operation.equipment, '')) || 'Не определён'}</td><td className="whitespace-pre-wrap">{estimateOperatorText(publicSourceText(operation.requirements, '')) || 'Отдельно не заданы'}</td>
  </tr>)}</tbody></table><p className="engineering-scroll-hint">Таблицу можно прокрутить по горизонтали.</p></div>{!!route.limitations?.length && <section className="mt-3 space-y-2" aria-label="Условия предварительной карты"><p className="font-medium">Условия и ограничения</p>{route.limitations.map((text,index) => <p key={index} className="text-sm text-muted">{estimateOperatorText(publicSourceText(text, ''))}</p>)}</section>}</>;
}
