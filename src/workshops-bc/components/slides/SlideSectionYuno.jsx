import SectionDivider from './_SectionDivider'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideSectionYuno({ pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <SectionDivider
      theme="blue-gradient"
      sectionNumber="01"
      titleLead={t('sectionDividers.yuno.titleLead')}
      titleAccent={t('sectionDividers.yuno.titleAccent')}
      subtitle={t('sectionDividers.yuno.subtitle')}
      pageNum={pageNum}
      total={total}
    />
  )
}
