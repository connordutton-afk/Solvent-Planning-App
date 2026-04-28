import React from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../Auth';
import { Palette, Type as FontIcon, Check, RefreshCw, Volume2, Music, Trash2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

const COLORS = [
  { name: 'Zinc', hex: '#18181b' },
  { name: 'Slate', hex: '#475569' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Emerald', hex: '#059669' },
];

const FONTS = [
  { name: 'Inter (Sans)', value: '"Inter", sans-serif' },
  { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { name: 'Outfit', value: '"Outfit", sans-serif' },
  { name: 'Space Grotesk', value: '"Space Grotesk", sans-serif' },
];

export function SettingsView() {
  const { user, profile } = useAuth();
  const [isUploading, setIsUploading] = useState<string | null>(null);

  const updateTheme = async (updates: any) => {
    if (!user || !profile) return;
    const currentTheme = profile.theme || { primaryColor: '#18181b', accentColor: '#10b981', fontFamily: '"Inter", sans-serif' };
    await updateDoc(doc(db, 'users', user.uid), {
      theme: { ...currentTheme, ...updates }
    });
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'notification' | 'click') => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 1024 * 1024) { // 1MB limit for Firestore doc size safety
      alert("File too large. Please keep sound files under 1MB.");
      return;
    }

    setIsUploading(type);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const field = type === 'notification' ? 'notificationSoundUrl' : 'clickSoundUrl';
      
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          [field]: dataUrl
        });
      } catch (err) {
        console.error("Sound upload error:", err);
      } finally {
        setIsUploading(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeSound = async (type: 'notification' | 'click') => {
    if (!user) return;
    const field = type === 'notification' ? 'notificationSoundUrl' : 'clickSoundUrl';
    await updateDoc(doc(db, 'users', user.uid), {
      [field]: null
    });
  };

  const activePrimary = profile?.theme?.primaryColor || '#18181b';
  const activeFont = profile?.theme?.fontFamily || '"Inter", sans-serif';

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Customization</h2>
        <p className="text-zinc-500">Personalize your Workspace theme, typography, and acoustics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {/* Colors */}
        <div className="space-y-6 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Palette className="w-5 h-5" />
            Primary Theme Color
          </div>
          <div className="grid grid-cols-4 gap-4">
            {COLORS.map((color) => (
              <button
                key={color.hex}
                onClick={() => updateTheme({ primaryColor: color.hex })}
                className={cn(
                  "aspect-square rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95",
                  activePrimary === color.hex ? "ring-4 ring-offset-2 ring-zinc-900" : "opacity-80"
                )}
                style={{ backgroundColor: color.hex }}
              >
                {activePrimary === color.hex && <Check className="w-6 h-6 text-white" />}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-400 font-medium">Selected: {COLORS.find(c => c.hex === activePrimary)?.name}</p>
        </div>

        {/* Typography */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-zinc-900">
            <FontIcon className="w-5 h-5" />
            System Typography
          </div>
          <div className="space-y-2">
            {FONTS.map((font) => (
              <button
                key={font.value}
                onClick={() => updateTheme({ fontFamily: font.value })}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                  activeFont === font.value 
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-lg" 
                    : "border-zinc-100 hover:border-zinc-300 text-zinc-600"
                )}
                style={{ fontFamily: font.value }}
              >
                <span className="font-bold">{font.name}</span>
                {activeFont === font.value && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Acoustics */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-lg font-bold text-zinc-900">
            <Volume2 className="w-5 h-5" />
            Acoustics
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Notification Sound</label>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer group">
                  <input 
                    type="file" 
                    accept="audio/*,video/*" 
                    onChange={(e) => handleSoundUpload(e, 'notification')} 
                    className="hidden" 
                  />
                  <div className={cn(
                    "h-12 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all",
                    profile?.notificationSoundUrl ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-zinc-100 hover:border-zinc-300 text-zinc-400"
                  )}>
                    {isUploading === 'notification' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                    {profile?.notificationSoundUrl ? 'Update Sound' : 'Upload MP3/MP4'}
                  </div>
                </label>
                {profile?.notificationSoundUrl && (
                  <button 
                    onClick={() => removeSound('notification')}
                    className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Click Sound</label>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer group">
                  <input 
                    type="file" 
                    accept="audio/*,video/*" 
                    onChange={(e) => handleSoundUpload(e, 'click')} 
                    className="hidden" 
                  />
                  <div className={cn(
                    "h-12 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all",
                    profile?.clickSoundUrl ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-zinc-100 hover:border-zinc-300 text-zinc-400"
                  )}>
                    {isUploading === 'click' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    {profile?.clickSoundUrl ? 'Update Sound' : 'Upload MP3/MP4'}
                  </div>
                </label>
                {profile?.clickSoundUrl && (
                  <button 
                    onClick={() => removeSound('click')}
                    className="w-12 h-12 flex items-center justify-center bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="pt-12 border-t border-zinc-100">
        <h3 className="text-lg font-bold mb-6">Theme Preview</h3>
        <div 
          className="bg-white p-8 rounded-[2.5rem] border border-zinc-200 shadow-sm space-y-6"
          style={{ fontFamily: activeFont }}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
              Preview Card
            </div>
            <h4 className="text-2xl font-bold" style={{ color: activePrimary }}>The quick brown fox jumps over the lazy dog.</h4>
            <p className="text-zinc-500 leading-relaxed max-w-lg">
              This is a live preview of how your text and colors will appear across the Solvent dashboard.
              All components will adapt to these settings automatically.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="px-6 py-2 rounded-xl text-white font-bold text-sm shadow-lg" style={{ backgroundColor: activePrimary }}>
              Action Button
            </button>
            <button className="px-6 py-2 rounded-xl bg-zinc-100 text-zinc-600 font-bold text-sm">
              Secondary
            </button>
          </div>
        </div>
      </div>

      <div className="pt-8 flex justify-center">
        <button 
          onClick={() => updateTheme({ primaryColor: '#18181b', accentColor: '#10b981', fontFamily: '"Inter", sans-serif' })}
          className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-zinc-900 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reset to Factory Defaults
        </button>
      </div>
    </div>
  );
}
