import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[PageErrorBoundary] Caught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[400px] items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-3" />
            <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <Button onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
