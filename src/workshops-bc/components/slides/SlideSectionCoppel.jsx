import SectionDivider from './_SectionDivider'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideSectionCoppel({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('sectionDividers.coppel.defaultClient')
  return (
    <SectionDivider
      theme="blue-gradient"
      sectionNumber="03"
      titleLead={t('sectionDividers.coppel.titleLead')}
      titleAccent={`${name}.`}
      subtitle={t('sectionDividers.coppel.subtitleTemplate').replace('{name}', name)}
      pageNum={pageNum}
      total={total}
      showClientLock
      clientName={name}
    />
  )
}
