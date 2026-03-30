import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Upload,
  FileUp,
  CheckCircle,
  Bot,
  Zap,
  Info,
} from 'lucide-react'
import { useBusinessCases } from '@/contexts/BusinessCasesContext'
import { parsePptxVariables } from '@/lib/pptx-parser'
import { toast } from 'sonner'
import type { DetectedVariable } from '@/types/business-cases'

// ── Variable badge ────────────────────────────────────────────────────────────

function VariableBadge({ v }: { v: DetectedVariable }) {
  if (v.type === 'ai') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
        <Bot className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-mono font-medium text-blue-800 break-all">{v.raw}</p>
          <p className="text-xs text-blue-600 mt-0.5 line-clamp-2">{v.instruction}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
      <Zap className="h-4 w-4 text-green-600 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-mono font-medium text-green-800">{v.raw}</p>
        <p className="text-xs text-green-600 mt-0.5">Auto-filled: {v.field_key || v.key}</p>
      </div>
    </div>
  )
}

// ── Path A: AI-Generated Template ────────────────────────────────────────────

function AiGeneratedTab() {
  const navigate = useNavigate()
  const { createTemplate, generateStructure } = useBusinessCases()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [language, setLanguage] = useState('English')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    if (!prompt.trim()) { toast.error('Please describe what this business case should cover'); return }

    setIsGenerating(true)
    try {
      const slides = await generateStructure(prompt, slideCount, language)
      const template = await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        generation_prompt: prompt.trim(),
        slide_structure: slides,
      })
      if (template) {
        toast.success('Plantilla creada exitosamente')
        navigate(`/business-cases/templates/${template.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate template')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-Generated Structure</CardTitle>
        <CardDescription>
          Describe the business case and AI will generate an optimized slide structure with all fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Template Name</Label>
          <Input id="name" placeholder="e.g. SaaS ROI Business Case" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Short Description (optional)</Label>
          <Input id="description" placeholder="e.g. For mid-market SaaS prospects" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prompt">What should this business case cover?</Label>
          <Textarea
            id="prompt"
            placeholder="Describe el propósito, audiencia objetivo, propuestas de valor, métricas a incluir (ROI, ahorro de tiempo, etc.)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="slideCount">Number of Slides</Label>
            <Input id="slideCount" type="number" min={5} max={20} value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">Language</Label>
            <Input id="language" placeholder="English, Spanish, French…" value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
        </div>
        <Button className="w-full" onClick={handleGenerate} disabled={isGenerating || !name.trim() || !prompt.trim()}>
          {isGenerating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating structure…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" />Generate Template</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Path B: Upload PPTX ───────────────────────────────────────────────────────

function UploadPptxTab() {
  const navigate = useNavigate()
  const { uploadPptxTemplate } = useBusinessCases()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [parsedVars, setParsedVars] = useState<DetectedVariable[] | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) {
      toast.error('Please upload a .pptx file')
      return
    }

    setFile(selected)
    setParsedVars(null)
    setIsParsing(true)

    try {
      const vars = await parsePptxVariables(selected)
      setParsedVars(vars)
      if (vars.length === 0) {
        toast.info('No {{variables}} found in the file. You can still save and use it as a template.')
      } else {
        toast.success(`Found ${vars.length} variable${vars.length > 1 ? 's' : ''} in your template`)
      }
      // Auto-fill template name from file name
      if (!name) {
        setName(selected.name.replace(/\.pptx$/i, '').replace(/[-_]/g, ' '))
      }
    } catch (err) {
      toast.error('Failed to parse PPTX file. Make sure it is a valid .pptx file.')
      setFile(null)
    } finally {
      setIsParsing(false)
    }
  }

  const handleSave = async () => {
    if (!file) { toast.error('Please upload a PPTX file'); return }
    if (!name.trim()) { toast.error('Template name is required'); return }

    setIsSaving(true)
    try {
      const template = await uploadPptxTemplate({
        file,
        name: name.trim(),
        description: description.trim() || undefined,
        detectedVariables: parsedVars || [],
      })
      if (template) {
        toast.success('Plantilla subida exitosamente')
        navigate(`/business-cases/templates/${template.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload template')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Card className="border-muted bg-muted/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">How to add variables to your PPTX:</p>
              <ul className="space-y-1">
                <li>
                  <span className="font-mono text-green-700 bg-green-50 px-1 rounded text-xs">{'{{empresa}}'}</span>{' '}
                  — Auto-filled from lead data (company, nombre, titulo, email, fecha, etc.)
                </li>
                <li>
                  <span className="font-mono text-blue-700 bg-blue-50 px-1 rounded text-xs">{'{{AI: Write a compelling value prop for this company}}'}</span>{' '}
                  — AI generates this content using company research
                </li>
              </ul>
              <p className="text-xs mt-1">
                Put each variable in its own text box for best results. Variables work in any slide.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Your PPTX Template</CardTitle>
          <CardDescription>
            Design your presentation in PowerPoint or Google Slides, add {'{{variables}}'}, then upload here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* File drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
              file ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={handleFileSelect}
            />
            {isParsing ? (
              <><Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-2" /><p className="text-sm text-muted-foreground">Parsing variables…</p></>
            ) : file ? (
              <>
                <CheckCircle className="h-8 w-8 text-primary mb-2" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB &bull; Click to replace
                </p>
              </>
            ) : (
              <>
                <FileUp className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Click to upload .pptx file</p>
                <p className="text-xs text-muted-foreground mt-1">Max 20 MB</p>
              </>
            )}
          </div>

          {/* Detected variables preview */}
          {parsedVars !== null && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                Detected Variables
                <Badge variant="secondary">{parsedVars.length}</Badge>
              </p>
              {parsedVars.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {'{{variables}}'} found. You can still upload — variables can be added later by re-uploading.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {parsedVars.map((v) => <VariableBadge key={v.key} v={v} />)}
                </div>
              )}
            </div>
          )}

          {/* Name & description */}
          <div className="space-y-1.5">
            <Label htmlFor="upload-name">Template Name</Label>
            <Input
              id="upload-name"
              placeholder="e.g. My Enterprise Deck"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="upload-description">Short Description (optional)</Label>
            <Input
              id="upload-description"
              placeholder="e.g. Branded deck for enterprise prospects"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={isSaving || !file || !name.trim() || isParsing}
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />Save Template</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BusinessCaseNew() {
  const navigate = useNavigate()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/business-cases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-heading">New Template</h1>
          <p className="text-muted-foreground text-sm">
            Create a template from scratch with AI, or upload your own branded PPTX
          </p>
        </div>
      </div>

      <Tabs defaultValue="upload">
        <TabsList className="mb-5 w-full">
          <TabsTrigger value="upload" className="flex-1">
            <Upload className="mr-2 h-4 w-4" />
            Upload PPTX
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1">
            <Sparkles className="mr-2 h-4 w-4" />
            AI Generated
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <UploadPptxTab />
        </TabsContent>
        <TabsContent value="ai">
          <AiGeneratedTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
