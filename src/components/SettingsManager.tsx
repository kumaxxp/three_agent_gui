import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/state/store'

type SavedSetting = {
  id: string;
  name: string;
  timestamp: number;
  agents: Record<string, any>;
}

type SettingsManagerProps = {
  isOpen: boolean;
  onClose: () => void;
  onFeedback: (msg: string) => void;
}

export default function SettingsManager({ isOpen, onClose, onFeedback }: SettingsManagerProps) {
  const { savedSettings, loadSavedSettings, saveSetting, loadSetting, deleteSetting } = useAppStore()
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [previewSetting, setPreviewSetting] = useState<SavedSetting | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSavedSettings()
    }
  }, [isOpen, loadSavedSettings])

  const handleSave = () => {
    if (saveName.trim()) {
      saveSetting(saveName.trim())
      setSaveName('')
      setShowSaveDialog(false)
      onFeedback(`設定「${saveName.trim()}」を保存しました`)
    }
  }

  const handleLoad = (id: string) => {
    const setting = savedSettings.find(s => s.id === id)
    if (setting) {
      loadSetting(id)
      onFeedback(`設定「${setting.name}」を読み込みました`)
      onClose()
    }
  }

  const handleDelete = (id: string) => {
    const setting = savedSettings.find(s => s.id === id)
    if (setting && confirm(`設定「${setting.name}」を削除しますか？`)) {
      deleteSetting(id)
      onFeedback(`設定「${setting.name}」を削除しました`)
      if (previewSetting?.id === id) {
        setPreviewSetting(null)
      }
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('ja-JP')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">設定管理</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        
        <div className="flex h-[600px]">
          {/* 左側：設定リスト */}
          <div className="w-1/2 border-r">
            <div className="p-4 border-b">
              <button
                onClick={() => setShowSaveDialog(true)}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                現在の設定を保存
              </button>
            </div>
            
            <div className="overflow-y-auto h-full">
              {savedSettings.length === 0 ? (
                <div className="p-4 text-gray-500 text-center">
                  保存された設定がありません
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {savedSettings.map((setting) => (
                    <div
                      key={setting.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        previewSetting?.id === setting.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setPreviewSetting(setting)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium">{setting.name}</h3>
                          <p className="text-sm text-gray-500">{formatDate(setting.timestamp)}</p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleLoad(setting.id)
                            }}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            読込
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(setting.id)
                            }}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* 右側：プレビュー */}
          <div className="w-1/2">
            {previewSetting ? (
              <div className="h-full overflow-y-auto">
                <div className="p-4 border-b">
                  <h3 className="font-semibold">プレビュー: {previewSetting.name}</h3>
                  <p className="text-sm text-gray-500">{formatDate(previewSetting.timestamp)}</p>
                </div>
                <div className="p-4 space-y-4">
                  {Object.entries(previewSetting.agents).map(([role, config]: [string, any]) => (
                    <div key={role} className="border rounded-lg p-3">
                      <h4 className="font-medium mb-2 capitalize">{config.name || role}</h4>
                      <div className="text-sm space-y-1">
                        <div><span className="font-medium">Provider:</span> {config.provider}</div>
                        <div><span className="font-medium">Model:</span> {config.model}</div>
                        <div><span className="font-medium">Temperature:</span> {config.temperature}</div>
                        <div><span className="font-medium">Max Tokens:</span> {config.max_tokens}</div>
                        {config.promptSystem && (
                          <div>
                            <span className="font-medium">System:</span>
                            <div className="mt-1 p-2 bg-gray-50 rounded text-xs">
                              {config.promptSystem}
                            </div>
                          </div>
                        )}
                        {config.promptStyle && (
                          <div>
                            <span className="font-medium">Style:</span>
                            <div className="mt-1 p-2 bg-gray-50 rounded text-xs">
                              {config.promptStyle}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                設定を選択してプレビューを表示
              </div>
            )}
          </div>
        </div>
        
        {/* 保存ダイアログ */}
        {showSaveDialog && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-semibold mb-4">設定を保存</h3>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="設定名を入力..."
                className="w-full border rounded px-3 py-2 mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setShowSaveDialog(false)
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}