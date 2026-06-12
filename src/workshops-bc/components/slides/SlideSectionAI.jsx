import SectionDivider from './_SectionDivider'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideSectionAI({ pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <SectionDivider
      theme="blue-gradient"
      sectionNumber="04"
      titleLead={t('sectionDividers.ai.titleLead')}
      titleAccent={t('sectionDividers.ai.titleAccent')}
      subtitle={t('sectionDividers.ai.subtitle')}
      pageNum={pageNum}
      total={total}
    />
  )
}
