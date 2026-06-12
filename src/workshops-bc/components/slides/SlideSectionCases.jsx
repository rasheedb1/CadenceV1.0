import SectionDivider from './_SectionDivider'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideSectionCases({ pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <SectionDivider
      theme="dark"
      sectionNumber="02"
      titleLead={t('sectionDividers.cases.titleLead')}
      titleAccent={t('sectionDividers.cases.titleAccent')}
      subtitle={t('sectionDividers.cases.subtitle')}
      pageNum={pageNum}
      total={total}
      haltoneColor="#3E4FE0"
      haltoneOpacity={0.65}
      orbColor="#3E4FE0"
    />
  )
}
