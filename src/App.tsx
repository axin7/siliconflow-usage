import { useState, useCallback } from "react";
import "./App.css";

interface KeyStatus {
  key: string;
  balance: number | null;
  status: "pending" | "success" | "error";
}

function App() {
  const [keys, setKeys] = useState("");
  const [results, setResults] = useState<KeyStatus[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [balanceFilter, setBalanceFilter] = useState<
    "all" | "positive" | "zero" | "gt5" | "gt10"
  >("all");
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [balanceSortOrder, setBalanceSortOrder] = useState<
    "asc" | "desc" | null
  >(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null);

  const handleCheck = async () => {
    const keyList = Array.from(new Set(keys.split("\n").filter((key) => key.trim())));
    if (keyList.length === 0) return;

    setIsChecking(true);
    setSelectedKeys(new Set());
    setLastSelectedKey(null);
    setResults(
      keyList.map((key) => ({
        key,
        balance: null,
        status: "pending",
      })),
    );

    // 并行请求的批次大小，可以根据实际情况调整
    const batchSize = 50;
    const allResults = [...Array(keyList.length)].map((_, i) => ({
      key: keyList[i],
      balance: null as number | null,
      status: "pending" as "pending" | "success" | "error",
    }));
    
    // 将所有keys分成多个批次
    for (let batchStart = 0; batchStart < keyList.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, keyList.length);
      const currentBatch = keyList.slice(batchStart, batchEnd);
      
      // 为当前批次创建请求Promise数组
      const batchPromises = currentBatch.map((key, batchIndex) => {
        const globalIndex = batchStart + batchIndex;
        
        return fetch("https://api.siliconflow.cn/v1/user/info", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${key}`,
          },
        })
          .then(response => response.json())
          .then(data => {
            // 在本地数组中更新这个key的结果，但不立即更新状态
            allResults[globalIndex] = {
              key: key,
              balance: data.status ? parseFloat(data.data.totalBalance) : null,
              status: data.status ? "success" : "error",
            };
            return { success: true };
          })
          .catch(error => {
            // 在本地数组中处理错误情况
            allResults[globalIndex] = {
              key: key,
              balance: null,
              status: "error",
            };
            return { success: false, error };
          });
      });
      
      // 等待当前批次的所有请求完成
      await Promise.all(batchPromises);
      
      // 批次完成后一次性更新UI，而不是每个请求都更新
      setResults([...allResults]);
    }

    setIsChecking(false);
  };

  const handleCopyValidKeys = async () => {
    const keysToExport = filteredSuccessResults
      .filter(
        (result) => selectedKeys.size === 0 || selectedKeys.has(result.key),
      )
      .map((result) => result.key)
      .join("\n");

    if (keysToExport) {
      try {
        await navigator.clipboard.writeText(keysToExport);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error("复制失败:", err);
      }
    }
  };

  const handleCopyToSimpleOneApi = async () => {
    const validKeysJson = JSON.stringify(
      filteredSuccessResults
        .filter(
          (result) => selectedKeys.size === 0 || selectedKeys.has(result.key),
        )
        .map((result) => ({
          api_key: `${result.key}`,
        })),
      null,
      2,
    );

    if (validKeysJson) {
      try {
        await navigator.clipboard.writeText(validKeysJson);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error("复制失败:", err);
      }
    }
    setShowCopyDropdown(false);
  };

  const validKeysCount = results.filter(
    (result) => result.status === "success",
  ).length;

  const filteredSuccessResults = results
    .filter((result) => {
      if (result.status !== "success") return false;

      switch (balanceFilter) {
        case "positive":
          return result.balance !== null && result.balance > 0;
        case "zero":
          return result.balance !== null && result.balance <= 0;
        case "gt5":
          return result.balance !== null && result.balance > 5;
        case "gt10":
          return result.balance !== null && result.balance > 10;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (balanceSortOrder === null || a.balance === null || b.balance === null)
        return 0;
      return balanceSortOrder === "asc"
        ? a.balance - b.balance
        : b.balance - a.balance;
    });

  const getAllVisibleKeys = useCallback(() => {
    const successKeys = filteredSuccessResults.map((r) => r.key);
    const errorKeys = results
      .filter((r) => r.status === "error")
      .map((r) => r.key);
    const pendingKeys = results
      .filter((r) => r.status === "pending")
      .map((r) => r.key);
    return [...successKeys, ...errorKeys, ...pendingKeys];
  }, [results, filteredSuccessResults]);

  const toggleSelectKey = (key: string, event: React.MouseEvent) => {
    const newSelected = new Set(selectedKeys);
    const allKeys = getAllVisibleKeys();

    if (event.shiftKey && lastSelectedKey) {
      const startIdx = allKeys.indexOf(lastSelectedKey);
      const endIdx = allKeys.indexOf(key);

      if (startIdx !== -1 && endIdx !== -1) {
        const start = Math.min(startIdx, endIdx);
        const end = Math.max(startIdx, endIdx);

        const keysToToggle = allKeys.slice(start, end + 1);
        const shouldSelect = !selectedKeys.has(key);

        keysToToggle.forEach((k) => {
          if (shouldSelect) {
            newSelected.add(k);
          } else {
            newSelected.delete(k);
          }
        });
      }
    } else {
      if (newSelected.has(key)) {
        newSelected.delete(key);
      } else {
        newSelected.add(key);
      }
    }

    setLastSelectedKey(key);
    setSelectedKeys(newSelected);
  };

  const toggleSelectAll = (results: KeyStatus[]) => {
    if (selectedKeys.size === results.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(results.map((r) => r.key)));
    }
    setLastSelectedKey(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-5 sm:p-6">
              <h1 className="text-2xl font-semibold text-gray-900 text-center mb-8">
                密钥余额检测
              </h1>

              <div className="space-y-4">
                <textarea
                  value={keys}
                  onChange={(e) => setKeys(e.target.value)}
                  placeholder="请输入要检测的密钥，每行一个"
                  rows={5}
                  disabled={isChecking}
                  className="input-base"
                />

                <div className="flex justify-end">
                  <button
                    onClick={handleCheck}
                    disabled={isChecking || !keys.trim()}
                    className="btn btn-primary"
                  >
                    {isChecking ? "检测中..." : "检测"}
                  </button>
                </div>
              </div>

              {results.length > 0 && (
                <div className="mt-8 space-y-8">
                  <div className="bg-white px-4 py-5 sm:px-6 border-b border-gray-200 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600">
                      共检测到{" "}
                      <span className="font-semibold text-gray-900">
                        {results.length}
                      </span>{" "}
                      个密钥， 其中{" "}
                      <span className="font-semibold text-emerald-600">
                        {validKeysCount}
                      </span>{" "}
                      个正常
                    </div>
                  </div>

                  {/* 正常密钥表格 */}
                  {results.some((r) => r.status === "success") && (
                    <div className="rounded-lg border border-emerald-200 overflow-hidden">
                      <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
                          <div className="flex items-center space-x-4">
                            <h3 className="text-lg font-medium text-emerald-800">
                              正常密钥
                            </h3>
                            <div className="flex items-center space-x-2">
                              <select
                                value={balanceFilter}
                                onChange={(e) =>
                                  setBalanceFilter(
                                    e.target.value as
                                      | "all"
                                      | "positive"
                                      | "zero"
                                      | "gt5"
                                      | "gt10",
                                  )
                                }
                                className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                              >
                                <option value="all">全部余额</option>
                                <option value="positive">余额大于0</option>
                                <option value="zero">余额小于等于0</option>
                                <option value="gt5">余额大于5</option>
                                <option value="gt10">余额大于10</option>
                              </select>
                            </div>
                          </div>
                          {validKeysCount > 0 && (
                            <div className="relative">
                              <div className="flex rounded-lg shadow-sm">
                                <button
                                  onClick={handleCopyValidKeys}
                                  className={`
                                    relative inline-flex items-center h-10
                                    ${
                                      copySuccess
                                        ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                        : "bg-white text-gray-700 hover:bg-gray-50"
                                    }
                                    text-sm font-medium
                                    border border-gray-300
                                    rounded-l-lg
                                    transition-all duration-200 ease-in-out
                                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500
                                    shadow-sm hover:shadow-md
                                    active:scale-[0.98]
                                    px-4
                                  `}
                                >
                                  <span className="flex items-center space-x-2">
                                    {copySuccess ? (
                                      <>
                                        <svg
                                          className="w-4 h-4 translate-y-[0.5px]"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 13l4 4L19 7"
                                          />
                                        </svg>
                                        <span>
                                          已复制
                                          {selectedKeys.size > 0
                                            ? `${selectedKeys.size}个`
                                            : ""}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <svg
                                          className="w-4 h-4 translate-y-[0.5px]"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                          />
                                        </svg>
                                        <span>
                                          复制
                                          {selectedKeys.size > 0
                                            ? `${selectedKeys.size}个`
                                            : "全部"}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </button>
                                <div className="relative -ml-px">
                                  <button
                                    type="button"
                                    className={`
                                      relative inline-flex items-center justify-center h-10 w-10
                                      ${
                                        copySuccess
                                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                          : "bg-white text-gray-700 hover:bg-gray-50"
                                      }
                                      text-sm font-medium
                                      border border-l-0 border-gray-300
                                      rounded-r-lg
                                      transition-all duration-200 ease-in-out
                                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500
                                      shadow-sm hover:shadow-md
                                      active:scale-[0.98]
                                    `}
                                    onClick={() =>
                                      setShowCopyDropdown(!showCopyDropdown)
                                    }
                                  >
                                    <svg
                                      className={`h-4 w-4 transition-transform duration-200 ${showCopyDropdown ? "rotate-180" : ""}`}
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </button>
                                  {showCopyDropdown && (
                                    <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none transform opacity-100 scale-100 transition-all duration-200 ease-out">
                                      <div className="py-1">
                                        <button
                                          onClick={handleCopyToSimpleOneApi}
                                          className="flex items-center w-full px-4 h-10 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
                                        >
                                          <svg
                                            className="w-4 h-4 mr-2 translate-y-[0.5px]"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                            />
                                          </svg>
                                          <span>复制到simple-one-api</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table-base">
                          <thead>
                            <tr>
                              <th scope="col" className="table-header w-10">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                  checked={
                                    selectedKeys.size ===
                                      filteredSuccessResults.length &&
                                    filteredSuccessResults.length > 0
                                  }
                                  onChange={() =>
                                    toggleSelectAll(filteredSuccessResults)
                                  }
                                />
                              </th>
                              <th scope="col" className="table-header">
                                密钥
                              </th>
                              <th scope="col" className="table-header">
                                状态
                              </th>
                              <th
                                scope="col"
                                className="table-header flex items-center space-x-2"
                              >
                                <span>余额</span>
                                <button
                                  onClick={() =>
                                    setBalanceSortOrder((prev) => {
                                      if (prev === null) return "asc";
                                      if (prev === "asc") return "desc";
                                      return null;
                                    })
                                  }
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                >
                                  <svg
                                    className={`w-4 h-4 transition-transform duration-200 ${balanceSortOrder === "desc" ? "rotate-180" : ""} ${balanceSortOrder === null ? "text-gray-300" : "text-emerald-600"}`}
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {filteredSuccessResults.map((result, index) => (
                              <tr
                                key={index}
                                className="bg-white hover:bg-emerald-50 transition-colors"
                              >
                                <td className="table-cell">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    checked={selectedKeys.has(result.key)}
                                    onChange={(e) =>
                                      toggleSelectKey(
                                        result.key,
                                        e.nativeEvent as unknown as React.MouseEvent,
                                      )
                                    }
                                  />
                                </td>
                                <td className="table-cell font-medium text-gray-900">
                                  {result.key}
                                </td>
                                <td className="table-cell">正常</td>
                                <td className="table-cell">
                                  {result.balance !== null
                                    ? `¥${result.balance.toFixed(2)}`
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                            {filteredSuccessResults.length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="table-cell text-center text-gray-500"
                                >
                                  没有符合条件的密钥
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 异常密钥表格 */}
                  {results.some((r) => r.status === "error") && (
                    <div className="rounded-lg border border-red-200 overflow-hidden">
                      <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                        <h3 className="text-lg font-medium text-red-800">
                          异常密钥
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table-base">
                          <thead>
                            <tr>
                              <th scope="col" className="table-header w-10">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                  checked={
                                    selectedKeys.size ===
                                    results.filter((r) => r.status === "error")
                                      .length
                                  }
                                  onChange={() =>
                                    toggleSelectAll(
                                      results.filter(
                                        (r) => r.status === "error",
                                      ),
                                    )
                                  }
                                />
                              </th>
                              <th scope="col" className="table-header">
                                密钥
                              </th>
                              <th scope="col" className="table-header">
                                状态
                              </th>
                              <th scope="col" className="table-header">
                                余额
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {results
                              .filter((result) => result.status === "error")
                              .map((result, index) => (
                                <tr
                                  key={index}
                                  className="bg-white hover:bg-red-50 transition-colors"
                                >
                                  <td className="table-cell">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                      checked={selectedKeys.has(result.key)}
                                      onChange={(e) =>
                                        toggleSelectKey(
                                          result.key,
                                          e.nativeEvent as unknown as React.MouseEvent,
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="table-cell font-medium text-gray-900">
                                    {result.key}
                                  </td>
                                  <td className="table-cell">异常</td>
                                  <td className="table-cell">
                                    {result.balance !== null
                                      ? `¥${result.balance.toFixed(2)}`
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 检测中的密钥表格 */}
                  {results.some((r) => r.status === "pending") && (
                    <div className="rounded-lg border border-amber-200 overflow-hidden">
                      <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                        <h3 className="text-lg font-medium text-amber-800">
                          检测中
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table-base">
                          <thead>
                            <tr>
                              <th scope="col" className="table-header w-10">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                  checked={
                                    selectedKeys.size ===
                                    results.filter(
                                      (r) => r.status === "pending",
                                    ).length
                                  }
                                  onChange={() =>
                                    toggleSelectAll(
                                      results.filter(
                                        (r) => r.status === "pending",
                                      ),
                                    )
                                  }
                                />
                              </th>
                              <th scope="col" className="table-header">
                                密钥
                              </th>
                              <th scope="col" className="table-header">
                                状态
                              </th>
                              <th scope="col" className="table-header">
                                余额
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {results
                              .filter((result) => result.status === "pending")
                              .map((result, index) => (
                                <tr
                                  key={index}
                                  className="bg-white hover:bg-amber-50 transition-colors"
                                >
                                  <td className="table-cell">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                      checked={selectedKeys.has(result.key)}
                                      onChange={(e) =>
                                        toggleSelectKey(
                                          result.key,
                                          e.nativeEvent as unknown as React.MouseEvent,
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="table-cell font-medium text-gray-900">
                                    {result.key}
                                  </td>
                                  <td className="table-cell">检测中</td>
                                  <td className="table-cell">-</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
