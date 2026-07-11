import React from 'react'

const SettingsPage = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-[#f8fafb]">
      <div className="bg-white border rounded-lg p-8 text-center max-w-md mx-auto">
        <h2 className="font-semibold text-lg mb-2">Project Settings</h2>
        <p className="text-gray-600 mb-4">Proje ayarlarını buradan yönetebilirsiniz.</p>
        <div className="space-y-6 text-left">
          <div>
            <div className="text-xs text-gray-500 uppercase mb-1">Tema</div>
            <select className="input-sb w-full">
              <option>Koyu</option>
              <option>Açık</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase mb-1">Dil</div>
            <select className="input-sb w-full">
              <option>Türkçe</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage 