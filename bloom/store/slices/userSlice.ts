import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type User = {
  id: string;
  email: string;
  name: string;
  isOnboarding: boolean;
};

type UserState = {
  currentUser: User | null;
  isAuthenticated: boolean;
  isOnboarding: boolean;
};

const initialState: UserState = {
  currentUser: null,
  isAuthenticated: false,
  isOnboarding: false,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.currentUser = action.payload;
      state.isOnboarding = action.payload.isOnboarding;
      if (!state.isOnboarding) {
        state.isAuthenticated = false;
      }
    },
    completeOnboarding(state) {
      state.isOnboarding = false;
      state.isAuthenticated = true;
      if (state.currentUser) state.currentUser.isOnboarding = false;
    },
    setAuthenticated(state, action: PayloadAction<boolean>) {
      state.isAuthenticated = action.payload;
    },
    logout(state) {
      state.currentUser = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, completeOnboarding, logout } = userSlice.actions;
export default userSlice.reducer;
