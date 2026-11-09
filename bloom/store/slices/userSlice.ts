import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type User = {
  id: string;
  email: string;
  name: string;
  isOnboarding: boolean;
  streak: number;
  maxStreak: number;
  fears: any;
  isConquering: boolean;
  conqueringFear?: string;
};

/** What the user chose on the conquer page; the backend generates a matching video. */
export type ConquerRequest = {
  fear: string;
  intensity: number;
  durationSeconds: number;
};

type UserState = {
  currentUser: User | null;
  authToken: string | null;
  isAuthenticated: boolean;
  isOnboarding: boolean;
  isConquering: boolean;
  conqueringFear?: string;
  conquerRequest: ConquerRequest | null;
};

const initialState: UserState = {
  currentUser: null,
  authToken: null,
  isAuthenticated: false,
  isOnboarding: false,
  isConquering: false,
  conquerRequest: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User & { authToken?: string }>) {
      const { authToken, ...user } = action.payload;
      state.currentUser = user;
      state.authToken = authToken ?? null;
      state.isOnboarding = user.isOnboarding;
      state.isAuthenticated = !user.isOnboarding;
    },
    updateStreak(state, action: PayloadAction<{ streak: number; maxStreak: number }>) {
      if (state.currentUser) {
        state.currentUser.streak = action.payload.streak;
        state.currentUser.maxStreak = action.payload.maxStreak;
      }
    },
    setFears(state, action: PayloadAction<string[]>) {
      if (state.currentUser) state.currentUser.fears = action.payload;
    },
    completeOnboarding(state) {
      state.isOnboarding = false;
      state.isAuthenticated = true;
      if (state.currentUser) state.currentUser.isOnboarding = false;
    },
    startConquer(state, action: PayloadAction<ConquerRequest>) {
      state.isConquering = true;
      state.conqueringFear = action.payload.fear;
      state.conquerRequest = action.payload;
    },
    endConquer(state) {
      state.isConquering = false;
      state.conqueringFear = '';
      state.conquerRequest = null;
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

export const {
  setUser,
  updateStreak,
  setFears,
  completeOnboarding,
  startConquer,
  endConquer,
  logout,
} = userSlice.actions;
export default userSlice.reducer;
