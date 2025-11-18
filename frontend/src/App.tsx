// frontend/src/App.tsx

import { Box } from '@chakra-ui/react';
import { Header } from './components/header'; // 4번에서 만든 헤더
import { BankPortalPage } from './features/bank-portal/BankPortalPage';
import './App.css'; // 1. App.css 파일의 내용도 비워주는 것이 좋습니다.

function App() {
  return (
    // 2. 앱 전체를 Chakra의 Box로 감쌉니다.
    <Box minH="100vh">
      <Header />
      <BankPortalPage />
    </Box>
  );
}

export default App;