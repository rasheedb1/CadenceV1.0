import SectionDivider from './_SectionDivider'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideSectionPOS({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('sectionDividers.pos.defaultClient')
  return (
    <SectionDivider
      theme="blue-gradient"
      sectionNumber="05"
      titleLead={t('sectionDividers.pos.titleLead')}
      titleAccent={t('sectionDividers.pos.titleAccent')}
      subtitle={t('sectionDividers.pos.subtitleTemplate').replace('{name}', name)}
      pageNum={pageNum}
      total={total}
      footerSection={t('sectionDividers.pos.footerSection')}
    />
  )
}
