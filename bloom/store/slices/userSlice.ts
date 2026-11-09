import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type User = {
  id: string;
  email: string;
  name: string;
  isOnboarding: boolean;
  streak: number;
  maxStreak: number;
  fears: any,
  isConquering?: boolean;
  conqueringFear?: string;
};

type UserState = {
  currentUser: User | null;
  authToken: string | null;
  isAuthenticated: boolean;
  isOnboarding: boolean;
  isConquering: boolean;
  conqueringFear?: string;
};

const initialState: UserState = {
  currentUser: null,
  authToken: null,
  isAuthenticated: false,
  isOnboarding: false,
  isConquering: false,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {

    setUser(state, action: PayloadAction<User>) {
      state.currentUser = action.payload;
      state.isOnboarding = action.payload.isOnboarding;
      if (!state.isOnboarding) {
        state.isAuthenticated = true;
      }
    },
    completeOnboarding(state) {
      state.isOnboarding = false;
      state.isAuthenticated = true;
      if (state.currentUser) state.currentUser.isOnboarding = false;
    },
    startConquer(state, action: PayloadAction<string>) {
      state.isConquering = true;
      state.conqueringFear = action.payload;
    },
    endConquer(state) {
      state.isConquering = false;
      state.conqueringFear = '';
    },
    setAuthenticated(state, action: PayloadAction<boolean>) {
      state.isAuthenticated = action.payload;
    },
    logout(state) {
      state.currentUser = null;
      state.authToken = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, completeOnboarding, startConquer, endConquer, logout } = userSlice.actions;
export default userSlice.reducer;
