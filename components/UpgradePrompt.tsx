'use client';

import React, { useState, useEffect } from 'react';
import { useUserState } from '../lib/hooks/useAppConfig';
import { updateUserState } from '../lib/user/userState';

export function UpgradePrompt() {
  const userState = useUserState();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 监听升级对话框显示事件
    const handleShowUpgrade = () => {
      if (userState.subscription === 'free') {
        setShowPrompt(true);
      }
    };

    // 监听同步尝试事件
    const handleSyncAttempt = () => {
      if (userState.subscription === 'free') {
        setShowPrompt(true);
      }
    };

    window.addEventListener('showUpgradeDialog', handleShowUpgrade);
    window.addEventListener('sync-attempt', handleSyncAttempt);

    return () => {
      window.removeEventListener('showUpgradeDialog', handleShowUpgrade);
      window.removeEventListener('sync-attempt', handleSyncAttempt);
    };
  }, [userState.subscription]);

  if (!showPrompt || userState.subscription !== 'free') {
    return null;
  }

  const handleUpgrade = () => {
    // 模拟升级流程 - 在实际应用中这里会跳转到付费页面
    const confirmed = confirm('这是一个演示。是否模拟升级到高级版本？');
    if (confirmed) {
      updateUserState({ subscription: 'premium' });
      setShowPrompt(false);
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">解锁云同步功能</h3>
            <p className="text-sm text-gray-500">升级到高级版本</p>
          </div>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            升级到高级版本，享受以下功能：
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center">
              <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              在所有设备间同步任务和数据
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              实时数据备份和恢复
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              离线工作，联网时自动同步
            </li>
            <li className="flex items-center">
              <svg className="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              高级导出和分享功能
            </li>
          </ul>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleUpgrade}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            立即升级
          </button>
          <button
            onClick={handleClose}
            className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}