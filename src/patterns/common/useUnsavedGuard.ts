import { useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useBlocker } from 'react-router-dom';

const MESSAGE = '저장하지 않은 변경 내용이 있습니다. 이동하면 변경 내용이 사라집니다.';

/**
 * Warn before losing unsaved edits: route changes (in-app), page unload,
 * and in-screen actions through confirmLeave().
 */
export const useUnsavedGuard = (dirty: boolean) => {
  const { modal } = App.useApp();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    modal.confirm({
      title: '이동할까요?',
      content: MESSAGE,
      okText: '확인',
      cancelText: '취소',
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset()
    });
  }, [blocker, modal]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  /** Run `action` now, or after the user confirms losing the edits. */
  return useCallback(
    (action: () => void) => {
      if (!dirty) return action();
      modal.confirm({ title: '이동할까요?', content: MESSAGE, okText: '확인', cancelText: '취소', onOk: action });
    },
    [dirty, modal]
  );
};
