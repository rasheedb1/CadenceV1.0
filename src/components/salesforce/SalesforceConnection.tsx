import { useSalesforceConnection } from '@/hooks/useSalesforceConnection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, CheckCircle2, XCircle, ExternalLink, RefreshCw, CloudOff } from 'lucide-react'

export function SalesforceConnection() {
  const { status, isLoading, actionLoading, connect, disconnect, sync } = useSalesforceConnection()

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">Salesforce</p>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : status.isConnected ? (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Connect Salesforce to identify accounts with active opportunities
          </p>
          {status.isConnected && status.sfUsername && (
            <p className="text-xs text-muted-foreground">
              Connected as {status.sfUsername}
            </p>
          )}
          {status.isConnected && status.lastSyncAt && (
            <p className="text-xs text-muted-foreground">
              Last synced: {formatDate(status.lastSyncAt)}
            </p>
          )}
          {status.lastError && (
            <p className="text-xs text-red-500">
              Error: {status.lastError}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {status.isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={sync}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Now
              </Button>
              <Button
                variant="outline"
                onClick={disconnect}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <CloudOff className="h-4 w-4 mr-2" />
                    Disconnect
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              onClick={connect}
              disabled={actionLoading || isLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Connect Salesforce
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
