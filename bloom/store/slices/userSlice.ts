import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type User = {
  id: string;
  email: string;
  name: string;
};

type UserState = {
  currentUser: User | null;
  isAuthenticated: boolean;
  isOnboarding: boolean;
};

const initialState: UserState = {
  currentUser: null,
  isAuthenticated: false,
  isOnboarding: false
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.currentUser = action.payload;
      state.isAuthenticated = true;
    },
    logout(state) {
      state.currentUser = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setUser, logout } = userSlice.actions;
export default userSlice.reducer;
